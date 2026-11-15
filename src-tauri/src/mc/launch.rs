use anyhow::{anyhow, Result};
use serde::Deserialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

use super::rules::{self, Features};
use super::version::{MavenName, Rule, VersionMeta};
use crate::state::{Account, Settings};

#[derive(Deserialize)]
struct ConditionalArg {
    #[serde(default)]
    rules: Vec<Rule>,
    value: serde_json::Value,
}

pub struct LaunchPlan {
    pub java: PathBuf,
    pub args: Vec<String>,
    pub cwd: PathBuf,
}

pub fn build(
    root: &Path,
    meta: &VersionMeta,
    version_id: &str,
    account: &Account,
    settings: &Settings,
    java: &Path,
) -> Result<LaunchPlan> {
    let libraries = root.join("libraries");
    let assets = root.join("assets");
    let natives = root.join("natives").join(version_id);
    let index_id = meta.asset_index_id().unwrap_or_else(|| "legacy".into());

    let features = Features {
        custom_resolution: settings.custom_resolution,
        quick_play: true,
        demo_user: false,
    };

    let mut classpath: Vec<String> = Vec::new();
    for lib in &meta.libraries {
        if !rules::allow(&lib.rules, &features) {
            continue;
        }
        if let Some(artifact) = lib.downloads.as_ref().and_then(|d| d.artifact.as_ref()) {
            if lib.natives.is_some() {
                continue;
            }
            let rel = artifact
                .path
                .clone()
                .or_else(|| MavenName::parse(&lib.name).map(|m| m.path()));
            if let Some(rel) = rel {
                classpath.push(libraries.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR)).display().to_string());
            }
        } else if let Some(maven) = MavenName::parse(&lib.name) {
            classpath.push(libraries.join(maven.path().replace('/', std::path::MAIN_SEPARATOR_STR)).display().to_string());
        }
    }
    classpath.push(
        root.join("versions")
            .join(version_id)
            .join(format!("{version_id}.jar"))
            .display()
            .to_string(),
    );
    let classpath = classpath.join(if cfg!(windows) { ";" } else { ":" });

    let token = account.access_token.clone().unwrap_or_else(|| "0".into());
    let uuid = account.id.replace('-', "");

    let mut vars: HashMap<&str, String> = HashMap::new();
    vars.insert("auth_player_name", account.name.clone());
    vars.insert("version_name", version_id.to_string());
    vars.insert("game_directory", root.display().to_string());
    vars.insert("assets_root", assets.display().to_string());
    vars.insert("game_assets", assets.join("virtual").join(&index_id).display().to_string());
    vars.insert("assets_index_name", index_id.clone());
    vars.insert("auth_uuid", uuid.clone());
    vars.insert("auth_access_token", token.clone());
    vars.insert("auth_session", format!("token:{token}:{uuid}"));
    vars.insert("user_type", if account.kind == "microsoft" { "msa".into() } else { "legacy".into() });
    vars.insert("version_type", meta.kind().to_string());
    vars.insert("user_properties", "{}".into());
    vars.insert("natives_directory", natives.display().to_string());
    vars.insert("launcher_name", "AquaLauncher".into());
    vars.insert("launcher_version", env!("CARGO_PKG_VERSION").into());
    vars.insert("classpath", classpath.clone());
    vars.insert("classpath_separator", if cfg!(windows) { ";".into() } else { ":".into() });
    vars.insert("library_directory", libraries.display().to_string());
    vars.insert("resolution_width", settings.width.to_string());
    vars.insert("resolution_height", settings.height.to_string());
    vars.insert("clientid", String::new());
    vars.insert("auth_xuid", String::new());
    vars.insert("xuid", String::new());

    let mut args: Vec<String> = Vec::new();

    match &meta.arguments {
        Some(arguments) if !arguments.jvm.is_empty() => {
            for value in &arguments.jvm {
                expand(value, &vars, &features, &mut args);
            }
        }
        _ => {
            args.push(format!("-Djava.library.path={}", natives.display()));
            args.push("-Dminecraft.launcher.brand=Aqua Launcher".into());
            args.push(format!("-Dminecraft.launcher.version={}", env!("CARGO_PKG_VERSION")));
            args.push("-cp".into());
            args.push(classpath);
        }
    }

    if let Some(log) = meta.logging.as_ref().and_then(|l| l.client.as_ref()) {
        let name = log
            .file
            .id
            .clone()
            .unwrap_or_else(|| format!("{version_id}.xml"));
        let path = assets.join("log_configs").join(name);
        if path.exists() {
            args.push(format!("-Dlog4j.configurationFile={}", path.display()));
        }
    }

    args.push(format!("-Xmx{}M", settings.memory_mb.max(512)));
    args.push(format!("-Xms{}M", settings.memory_mb.clamp(512, 2048)));
    args.push("-Dfile.encoding=UTF-8".into());
    if settings.optimized_flags {
        for flag in [
            "-XX:+UseG1GC",
            "-XX:+ParallelRefProcEnabled",
            "-XX:MaxGCPauseMillis=200",
            "-XX:+UnlockExperimentalVMOptions",
            "-XX:+DisableExplicitGC",
            "-XX:G1NewSizePercent=30",
            "-XX:G1MaxNewSizePercent=40",
            "-XX:G1HeapRegionSize=8M",
            "-XX:G1ReservePercent=20",
            "-XX:G1HeapWastePercent=5",
            "-XX:G1MixedGCCountTarget=4",
            "-XX:InitiatingHeapOccupancyPercent=15",
            "-XX:G1MixedGCLiveThresholdPercent=90",
            "-XX:G1RSetUpdatingPauseTimePercent=5",
            "-XX:SurvivorRatio=32",
            "-XX:+PerfDisableSharedMem",
            "-XX:MaxTenuringThreshold=1",
        ] {
            args.push(flag.to_string());
        }
    }
    for extra in tokenize(&settings.jvm_args) {
        args.push(extra);
    }

    let main_class = meta
        .main_class
        .clone()
        .ok_or_else(|| anyhow!("В манифесте версии нет mainClass"))?;
    args.push(main_class);

    let mut game_args: Vec<String> = Vec::new();
    if let Some(arguments) = &meta.arguments {
        for value in &arguments.game {
            expand(value, &vars, &features, &mut game_args);
        }
    } else if let Some(legacy) = &meta.minecraft_arguments {
        game_args.extend(tokenize(&substitute(legacy, &vars)));
    }

    if settings.fullscreen && !game_args.iter().any(|a| a == "--fullscreen") {
        game_args.push("--fullscreen".into());
    }
    if settings.custom_resolution
        && !settings.fullscreen
        && !game_args.iter().any(|a| a == "--width")
    {
        game_args.push("--width".into());
        game_args.push(settings.width.to_string());
        game_args.push("--height".into());
        game_args.push(settings.height.to_string());
    }

    args.extend(game_args);

    Ok(LaunchPlan {
        java: java.to_path_buf(),
        args,
        cwd: root.to_path_buf(),
    })
}

fn expand(
    value: &serde_json::Value,
    vars: &HashMap<&str, String>,
    features: &Features,
    out: &mut Vec<String>,
) {
    match value {
        serde_json::Value::String(text) => out.push(substitute(text, vars)),
        serde_json::Value::Number(number) => out.push(number.to_string()),
        serde_json::Value::Array(items) => {
            for item in items {
                expand(item, vars, features, out);
            }
        }
        serde_json::Value::Object(_) => {
            if let Ok(conditional) = serde_json::from_value::<ConditionalArg>(value.clone()) {
                if rules::allow(&conditional.rules, features) {
                    expand(&conditional.value, vars, features, out);
                }
            }
        }
        _ => {}
    }
}

fn substitute(text: &str, vars: &HashMap<&str, String>) -> String {
    let mut out = text.to_string();
    for (key, value) in vars {
        let needle = format!("${{{key}}}");
        if out.contains(&needle) {
            out = out.replace(&needle, value);
        }
    }
    out
}

/// Splits a command line respecting double quotes (legacy `minecraftArguments`).
fn tokenize(input: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut current = String::new();
    let mut quoted = false;
    let mut has_token = false;
    for ch in input.chars() {
        match ch {
            '"' => {
                quoted = !quoted;
                has_token = true;
            }
            c if c.is_whitespace() && !quoted => {
                if has_token || !current.is_empty() {
                    out.push(std::mem::take(&mut current));
                    has_token = false;
                }
            }
            c => {
                current.push(c);
                has_token = true;
            }
        }
    }
    if !current.is_empty() {
        out.push(current);
    }
    out
}
