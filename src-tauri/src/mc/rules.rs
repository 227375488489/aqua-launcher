use super::version::Rule;
use std::collections::HashMap;

#[derive(Debug, Clone, Default)]
pub struct Features {
    pub demo_user: bool,
    pub custom_resolution: bool,
    pub quick_play: bool,
}

impl Features {
    pub fn to_map(&self) -> HashMap<String, bool> {
        let mut map = HashMap::new();
        map.insert("is_demo_user".to_string(), self.demo_user);
        map.insert("has_custom_resolution".to_string(), self.custom_resolution);
        map.insert("has_quick_plays_support".to_string(), self.quick_play);
        map.insert("is_quick_play_singleplayer".to_string(), false);
        map.insert("is_quick_play_multiplayer".to_string(), false);
        map.insert("is_quick_play_realms".to_string(), false);
        map
    }
}

pub fn os_name() -> &'static str {
    if cfg!(windows) {
        "windows"
    } else if cfg!(target_os = "macos") {
        "osx"
    } else {
        "linux"
    }
}

pub fn os_arch() -> &'static str {
    if cfg!(target_arch = "x86_64") {
        "x86_64"
    } else if cfg!(target_arch = "aarch64") {
        "arm64"
    } else {
        "x86"
    }
}

/// Mojang rules: empty means allowed; otherwise the last matching rule wins.
pub fn allow(rules: &[Rule], features: &Features) -> bool {
    if rules.is_empty() {
        return true;
    }
    let mut allowed = false;
    for rule in rules {
        if matches(rule, features) {
            allowed = rule.action == "allow";
        }
    }
    allowed
}

fn matches(rule: &Rule, features: &Features) -> bool {
    if let Some(os) = &rule.os {
        if let Some(name) = &os.name {
            if name != os_name() {
                return false;
            }
        }
        if let Some(arch) = &os.arch {
            if arch != os_arch() && !(arch == "x86" && os_arch() != "x86_64") {
                return false;
            }
        }
        if let Some(version) = &os.version {
            if !version_matches(version) {
                return false;
            }
        }
    }
    if let Some(wanted) = &rule.features {
        let actual = features.to_map();
        for (key, value) in wanted {
            if actual.get(key).copied().unwrap_or(false) != *value {
                return false;
            }
        }
    }
    true
}

/// Approximate match for the rare `os.version` rules (e.g. `^10\.` on Windows).
fn version_matches(spec: &str) -> bool {
    if !cfg!(windows) {
        return true;
    }
    let actual = "10.0";
    let cleaned: String = spec
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == '.')
        .collect();
    let cleaned = cleaned.trim_matches('.').to_string();
    if cleaned.is_empty() {
        return true;
    }
    actual.starts_with(&cleaned) || cleaned.starts_with(actual)
}
