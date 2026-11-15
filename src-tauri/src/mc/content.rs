use std::sync::Mutex;
use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

const FEED: &str = "https://launchercontent.mojang.com/v2/javaPatchNotes.json";
const BASE: &str = "https://launchercontent.mojang.com";
const TTL: Duration = Duration::from_secs(1800);

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Banner {
    pub version: String,
    pub image: String,
    pub title: String,
    pub date: String,
}

#[derive(Deserialize)]
struct Feed {
    entries: Vec<Entry>,
}

#[derive(Deserialize)]
struct Entry {
    version: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    date: String,
    image: Option<Image>,
}

#[derive(Deserialize)]
struct Image {
    url: String,
}

static CACHE: Mutex<Option<(Instant, Vec<Banner>)>> = Mutex::new(None);

pub async fn get(client: &reqwest::Client) -> Result<Vec<Banner>> {
    if let Ok(guard) = CACHE.lock() {
        if let Some((at, list)) = guard.as_ref() {
            if at.elapsed() < TTL {
                return Ok(list.clone());
            }
        }
    }

    match fetch(client).await {
        Ok(list) => {
            if let Ok(mut guard) = CACHE.lock() {
                *guard = Some((Instant::now(), list.clone()));
            }
            Ok(list)
        }
        Err(err) => {
            let cached = CACHE
                .lock()
                .ok()
                .and_then(|guard| guard.as_ref().map(|(_, list)| list.clone()));
            cached.ok_or(err)
        }
    }
}

async fn fetch(client: &reqwest::Client) -> Result<Vec<Banner>> {
    let feed: Feed = client
        .get(FEED)
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .context("Баннеры версий недоступны")?
        .error_for_status()
        .context("Баннеры версий недоступны")?
        .json()
        .await
        .context("Не удалось прочитать список баннеров")?;

    let mut out = Vec::with_capacity(feed.entries.len());
    for entry in feed.entries {
        let Some(image) = entry.image else { continue };
        if image.url.is_empty() {
            continue;
        }
        let image = if image.url.starts_with("http") {
            image.url
        } else {
            format!("{BASE}{}", image.url)
        };
        out.push(Banner {
            version: entry.version,
            image,
            title: entry.title,
            date: entry.date,
        });
    }
    Ok(out)
}
