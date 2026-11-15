use std::path::{Path, PathBuf};

/// Root of all launcher data (config, cache, runtimes).
pub fn data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("AquaLauncher")
}

pub fn ensure_dir(p: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(p)
}

pub fn file_name_lower(p: &Path) -> String {
    p.file_name()
        .map(|s| s.to_string_lossy().to_lowercase())
        .unwrap_or_default()
}
