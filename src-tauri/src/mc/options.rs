//! Запись options.txt и выбор графического адаптера для инстанса.

use anyhow::Result;
use std::path::Path;

use crate::state::InstanceOptions;

fn set(lines: &mut Vec<String>, key: &str, value: String) {
    let prefix = format!("{key}:");
    if let Some(line) = lines.iter_mut().find(|line| line.starts_with(&prefix)) {
        *line = format!("{prefix}{value}");
    } else {
        lines.push(format!("{prefix}{value}"));
    }
}

/// Аккуратно обновляет options.txt, не трогая незнакомые игроку настройки.
pub fn apply(game_dir: &Path, options: &InstanceOptions) -> Result<()> {
    if options.language.is_none()
        && options.max_fps.is_none()
        && options.vsync.is_none()
        && options.gui_scale.is_none()
        && options.render_distance.is_none()
        && options.graphics.is_none()
        && options.particles.is_none()
        && options.music.is_none()
        && options.sound.is_none()
        && options.fullscreen.is_none()
    {
        return Ok(());
    }

    std::fs::create_dir_all(game_dir)?;
    let path = game_dir.join("options.txt");
    let mut lines: Vec<String> = std::fs::read_to_string(&path)
        .unwrap_or_default()
        .lines()
        .map(str::to_string)
        .collect();

    if let Some(language) = &options.language {
        set(&mut lines, "lang", language.clone());
    }
    if let Some(fps) = options.max_fps {
        set(&mut lines, "maxFps", fps.to_string());
    }
    if let Some(vsync) = options.vsync {
        set(&mut lines, "enableVsync", vsync.to_string());
    }
    if let Some(scale) = options.gui_scale {
        set(&mut lines, "guiScale", scale.to_string());
    }
    if let Some(distance) = options.render_distance {
        set(&mut lines, "renderDistance", distance.to_string());
    }
    if let Some(graphics) = &options.graphics {
        let value = match graphics.as_str() {
            "fast" => "0",
            "fabulous" => "2",
            _ => "1",
        };
        set(&mut lines, "graphicsMode", value.to_string());
    }
    if let Some(particles) = &options.particles {
        let value = match particles.as_str() {
            "decreased" => "1",
            "minimal" => "2",
            _ => "0",
        };
        set(&mut lines, "particles", value.to_string());
    }
    if let Some(music) = options.music {
        set(&mut lines, "soundCategory_music", if music { "1.0" } else { "0.0" }.to_string());
    }
    if let Some(sound) = options.sound {
        set(&mut lines, "soundCategory_master", if sound { "1.0" } else { "0.0" }.to_string());
    }
    if let Some(fullscreen) = options.fullscreen {
        set(&mut lines, "fullscreen", fullscreen.to_string());
    }

    std::fs::write(path, lines.join("\n") + "\n")?;
    Ok(())
}

/// Windows: предпочесть дискретную видеокарту для конкретного java.exe.
pub fn gpu_preference(java: &Path, prefer_high: bool) {
    #[cfg(windows)]
    {
        let key = r"HKCU\Software\Microsoft\DirectX\UserGpuPreferences";
        let mut command = std::process::Command::new("reg");
        command.args([
            "add",
            key,
            "/v",
            &java.display().to_string(),
            "/t",
            "REG_SZ",
            "/d",
            if prefer_high { "GpuPreference=2;" } else { "GpuPreference=0;" },
            "/f",
        ]);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x0800_0000);
        }
        let _ = command.output();
    }
    #[cfg(not(windows))]
    {
        let _ = (java, prefer_high);
    }
}
