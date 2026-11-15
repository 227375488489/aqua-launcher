use anyhow::{anyhow, Result};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use crate::state::{now_secs, Account};

const DEVICE_CODE_URL: &str = "https://login.live.com/oauth20_connect.srf";
const TOKEN_URL: &str = "https://login.live.com/oauth20_token.srf";
const XBL_URL: &str = "https://user.auth.xboxlive.com/user/authenticate";
const XSTS_URL: &str = "https://xsts.auth.xboxlive.com/xsts/authorize";
const MC_LOGIN_URL: &str = "https://api.minecraftservices.com/authentication/login_with_xbox";
const PROFILE_URL: &str = "https://api.minecraftservices.com/minecraft/profile";
const SCOPE: &str = "XboxLive.signin offline_access";

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DeviceFlow {
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

pub async fn start(client: &reqwest::Client, client_id: &str) -> Result<(DeviceFlow, String)> {
    let params = [
        ("client_id", client_id),
        ("scope", SCOPE),
        ("response_type", "device_code"),
    ];
    let response = client.post(DEVICE_CODE_URL).form(&params).send().await?;
    let status = response.status();
    let body: serde_json::Value = response.json().await?;
    if !status.is_success() {
        return Err(anyhow!(
            "Microsoft отклонил запрос авторизации: {}",
            proper_error(&body)
        ));
    }
    let text = |key: &str| {
        body.get(key)
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string()
    };
    let flow = DeviceFlow {
        user_code: text("user_code"),
        verification_uri: text("verification_uri"),
        expires_in: body.get("expires_in").and_then(|v| v.as_u64()).unwrap_or(900),
        interval: body.get("interval").and_then(|v| v.as_u64()).unwrap_or(5),
    };
    let device_code = text("device_code");
    if flow.user_code.is_empty() || device_code.is_empty() {
        return Err(anyhow!("Microsoft вернул неполный ответ авторизации"));
    }
    Ok((flow, device_code))
}

pub async fn poll(
    client: &reqwest::Client,
    client_id: &str,
    device_code: &str,
    interval: u64,
    cancel: &AtomicBool,
) -> Result<Account> {
    let mut wait = interval.clamp(2, 30);
    let deadline = now_secs() + 900;
    loop {
        if cancel.load(Ordering::SeqCst) {
            return Err(anyhow!("Вход отменён"));
        }
        if now_secs() > deadline {
            return Err(anyhow!("Код истёк. Начните вход заново."));
        }
        tokio::time::sleep(Duration::from_secs(wait)).await;
        if cancel.load(Ordering::SeqCst) {
            return Err(anyhow!("Вход отменён"));
        }

        let params = [
            ("client_id", client_id),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ("device_code", device_code),
        ];
        let response = client.post(TOKEN_URL).form(&params).send().await?;
        let body: serde_json::Value = response.json().await?;

        if let Some(token) = body.get("access_token").and_then(|v| v.as_str()) {
            return finish(client, token, body.get("refresh_token").and_then(|v| v.as_str())).await;
        }

        match body.get("error").and_then(|v| v.as_str()).unwrap_or("") {
            "authorization_pending" => continue,
            "slow_down" => {
                wait = (wait + 5).min(30);
                continue;
            }
            "expired_token" | "code_expired" => {
                return Err(anyhow!("Код истёк. Начните вход заново."))
            }
            "authorization_declined" | "access_denied" => {
                return Err(anyhow!("Вход отклонён в Microsoft"))
            }
            other => {
                return Err(anyhow!(
                    "Ошибка авторизации Microsoft: {}",
                    if other.is_empty() { proper_error(&body) } else { other.to_string() }
                ))
            }
        }
    }
}

pub async fn refresh(client: &reqwest::Client, client_id: &str, account: &Account) -> Result<Account> {
    let refresh_token = account
        .refresh_token
        .clone()
        .ok_or_else(|| anyhow!("Нет refresh-токена, войдите заново"))?;
    let params = [
        ("client_id", client_id),
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token.as_str()),
        ("scope", SCOPE),
    ];
    let response = client.post(TOKEN_URL).form(&params).send().await?;
    let body: serde_json::Value = response.json().await?;
    let access = body
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Не удалось обновить токен Microsoft: {}", proper_error(&body)))?;
    let new_refresh = body
        .get("refresh_token")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or(refresh_token);

    let mut updated = finish(client, access, Some(&new_refresh)).await?;
    updated.name = account.name.clone();
    Ok(updated)
}

async fn finish(
    client: &reqwest::Client,
    ms_access: &str,
    refresh_token: Option<&str>,
) -> Result<Account> {
    let (xbl_token, _) = xbox_live(client, ms_access).await?;
    let (xsts_token, uhs, xuid) = xsts(client, &xbl_token).await?;

    let response = client
        .post(MC_LOGIN_URL)
        .json(&serde_json::json!({
            "identityToken": format!("XBL3.0 x={uhs};{xsts_token}")
        }))
        .send()
        .await?;
    let status = response.status();
    let body: serde_json::Value = response.json().await?;
    if !status.is_success() {
        return Err(anyhow!("Minecraft отклонил вход: {}", proper_error(&body)));
    }
    let access_token = body
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Minecraft не выдал токен"))?
        .to_string();
    let expires_in = body.get("expires_in").and_then(|v| v.as_u64()).unwrap_or(86400);

    let profile = client
        .get(PROFILE_URL)
        .bearer_auth(&access_token)
        .send()
        .await?;
    if profile.status() == reqwest::StatusCode::NOT_FOUND {
        return Err(anyhow!(
            "У аккаунта нет лицензии Minecraft: Java Edition. Для пиратского запуска добавьте offline-аккаунт."
        ));
    }
    let profile: serde_json::Value = profile.error_for_status()?.json().await?;
    let id = profile.get("id").and_then(|v| v.as_str()).unwrap_or_default().to_string();
    let name = profile.get("name").and_then(|v| v.as_str()).unwrap_or_default().to_string();
    if id.is_empty() || name.is_empty() {
        return Err(anyhow!("Не удалось получить профиль Minecraft"));
    }
    let _ = xuid;

    Ok(Account {
        id,
        kind: "microsoft".into(),
        name,
        access_token: Some(access_token),
        refresh_token: refresh_token.map(|s| s.to_string()),
        expires_at: now_secs() + expires_in as i64,
    })
}

async fn xbox_live(client: &reqwest::Client, ms_access: &str) -> Result<(String, String)> {
    let response = client
        .post(XBL_URL)
        .json(&serde_json::json!({
            "Properties": {
                "AuthMethod": "RPS",
                "SiteName": "user.auth.xboxlive.com",
                "RpsTicket": format!("d={ms_access}")
            },
            "RelyingParty": "http://auth.xboxlive.com",
            "TokenType": "JWT"
        }))
        .send()
        .await?;
    let status = response.status();
    let body: serde_json::Value = response.json().await?;
    if !status.is_success() {
        return Err(anyhow!("Xbox Live отклонил токен: {}", proper_error(&body)));
    }
    let token = body.get("Token").and_then(|v| v.as_str()).unwrap_or_default().to_string();
    let uhs = body
        .pointer("/DisplayClaims/xui/0/uhs")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    if token.is_empty() {
        return Err(anyhow!("Xbox Live не вернул токен"));
    }
    Ok((token, uhs))
}

async fn xsts(client: &reqwest::Client, xbl_token: &str) -> Result<(String, String, String)> {
    let response = client
        .post(XSTS_URL)
        .json(&serde_json::json!({
            "Properties": { "SandboxId": "RETAIL", "UserTokens": [xbl_token] },
            "RelyingParty": "rp://api.minecraftservices.com/",
            "TokenType": "JWT"
        }))
        .send()
        .await?;
    let status = response.status();
    let body: serde_json::Value = response.json().await?;
    if !status.is_success() {
        let code = body.get("XErr").and_then(|v| v.as_i64()).unwrap_or(0);
        let message = match code {
            2148916233 => "У аккаунта нет профиля Xbox. Создайте его на xbox.com и повторите.",
            2148916235 => "Xbox Live недоступен в вашей стране.",
            2148916236 | 2148916237 => "Нужна проверка возраста в Xbox Live.",
            2148916238 => "Детский аккаунт: добавьте его в семейную группу Microsoft.",
            _ => "Xbox Live отклонил запрос авторизации.",
        };
        return Err(anyhow!("{message}"));
    }
    let token = body.get("Token").and_then(|v| v.as_str()).unwrap_or_default().to_string();
    let uhs = body
        .pointer("/DisplayClaims/xui/0/uhs")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    let xuid = body
        .pointer("/DisplayClaims/xui/0/xid")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    if token.is_empty() {
        return Err(anyhow!("XSTS не вернул токен"));
    }
    Ok((token, uhs, xuid))
}

fn proper_error(body: &serde_json::Value) -> String {
    if let Some(desc) = body.get("error_description").and_then(|v| v.as_str()) {
        return desc.split(':').nth(1).unwrap_or(desc).trim().to_string();
    }
    if let Some(message) = body.get("Message").and_then(|v| v.as_str()) {
        if !message.is_empty() {
            return message.to_string();
        }
    }
    if let Some(error) = body.get("error").and_then(|v| v.as_str()) {
        return error.to_string();
    }
    "неизвестная ошибка".into()
}

pub fn offline_uuid(name: &str) -> String {
    let digest = md5::compute(format!("OfflinePlayer:{name}"));
    let mut bytes = digest.0;
    bytes[6] = (bytes[6] & 0x0f) | 0x30;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    let hex = crate::net::hex(&bytes);
    format!(
        "{}-{}-{}-{}-{}",
        &hex[0..8],
        &hex[8..12],
        &hex[12..16],
        &hex[16..20],
        &hex[20..32]
    )
}
