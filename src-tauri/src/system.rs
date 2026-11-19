use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

/// Снимок железа. Заполняется из WMI один раз за сессию (данные меняются разве что
/// при пересборке ПК), свободное место на диске перечитывается по запросу.
#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Specs {
    pub cpu: String,
    pub cores: u32,
    pub threads: u32,
    pub ram_gb: u32,
    pub gpu: String,
    pub vram_gb: u32,
    pub disk_free_gb: u32,
    pub disk_total_gb: u32,
    pub os: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ShaderEstimate {
    /// none | light | balanced | heavy
    pub id: String,
    pub fps_low: u32,
    pub fps_high: u32,
    /// easily | fine | tight | no
    pub verdict: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Recommendation {
    pub tier: String,
    pub memory_mb: u32,
    pub render_distance: u32,
    pub width: u32,
    pub height: u32,
    pub shaders: Vec<ShaderEstimate>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub specs: Specs,
    pub recommendation: Recommendation,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct Raw {
    #[serde(default)]
    cpu: String,
    #[serde(default)]
    cores: u32,
    #[serde(default)]
    threads: u32,
    #[serde(default)]
    ram: u32,
    #[serde(default)]
    gpu: String,
    #[serde(default)]
    vram: u32,
    #[serde(default)]
    free: u32,
    #[serde(default)]
    total: u32,
}

static CACHE: Mutex<Option<(Instant, Specs)>> = Mutex::new(None);

const TTL: Duration = Duration::from_secs(600);

const QUERY: &str = r#"
$ErrorActionPreference = 'SilentlyContinue'
$cs = Get-CimInstance Win32_ComputerSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$gpu = Get-CimInstance Win32_VideoController | Where-Object { $_.Name -notmatch 'Basic|Remote|Parsec|Virtual' } | Sort-Object AdapterRAM -Descending | Select-Object -First 1
if (-not $gpu) { $gpu = Get-CimInstance Win32_VideoController | Select-Object -First 1 }
$disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$env:SystemDrive'"
[pscustomobject]@{
  cpu  = $cpu.Name
  cores = [int]$cpu.NumberOfCores
  threads = [int]$cpu.NumberOfLogicalProcessors
  ram = [int][math]::Round($cs.TotalPhysicalMemory / 1GB)
  gpu = $gpu.Name
  vram = [int][math]::Round(($gpu.AdapterRAM | ForEach-Object { if ($_ -gt 0) { $_ } else { 0 } }) / 1GB)
  free = [int][math]::Round($disk.FreeSpace / 1GB)
  total = [int][math]::Round($disk.Size / 1GB)
} | ConvertTo-Json -Compress
"#;

fn hidden(cmd: &mut std::process::Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let _ = &cmd;
}

#[cfg(windows)]
fn probe_windows() -> Specs {
    let mut cmd = std::process::Command::new("powershell");
    cmd.args(["-NoProfile", "-NonInteractive", "-Command", QUERY]);
    hidden(&mut cmd);
    let raw = match cmd.output() {
        Ok(out) => String::from_utf8_lossy(&out.stdout).to_string(),
        Err(_) => return Specs::default(),
    };
    let parsed: Raw = serde_json::from_str(raw.trim()).unwrap_or_default();
    Specs {
        cpu: parsed.cpu.trim().to_string(),
        cores: parsed.cores.max(1),
        threads: parsed.threads.max(1),
        ram_gb: parsed.ram.max(1),
        gpu: parsed.gpu.trim().to_string(),
        vram_gb: parsed.vram,
        disk_free_gb: parsed.free,
        disk_total_gb: parsed.total,
        os: format!("Windows {}", std::env::consts::ARCH),
    }
}

fn capture(program: &str, args: &[&str]) -> String {
    let mut cmd = std::process::Command::new(program);
    cmd.args(args);
    hidden(&mut cmd);
    match cmd.output() {
        Ok(out) => String::from_utf8_lossy(&out.stdout).to_string(),
        Err(_) => String::new(),
    }
}

fn df_root() -> (u32, u32) {
    let raw = capture("df", &["-k", "/"]);
    let line = raw.lines().nth(1).unwrap_or("");
    let fields: Vec<&str> = line.split_whitespace().collect();
    let total = fields.get(1).and_then(|v| v.parse::<u64>().ok()).unwrap_or(0);
    let free = fields.get(3).and_then(|v| v.parse::<u64>().ok()).unwrap_or(0);
    ((total / 1_048_576) as u32, (free / 1_048_576) as u32)
}

#[cfg(target_os = "macos")]
fn probe_macos() -> Specs {
    let mut cpu = capture("sysctl", &["-n", "machdep.cpu.brand_string"]).trim().to_string();
    if cpu.is_empty() {
        cpu = capture("sysctl", &["-n", "hw.model"]).trim().to_string();
    }
    let cores = capture("sysctl", &["-n", "hw.physicalcpu"]).trim().parse().unwrap_or(1);
    let threads = capture("sysctl", &["-n", "hw.logicalcpu"]).trim().parse().unwrap_or(cores);
    let ram_gb = (capture("sysctl", &["-n", "hw.memsize"]).trim().parse::<u64>().unwrap_or(0)
        / 1_073_741_824) as u32;

    let displays = capture("system_profiler", &["SPDisplaysDataType"]);
    let mut gpu = String::new();
    let mut vram_gb = 0u32;
    for line in displays.lines() {
        let line = line.trim();
        if let Some(value) = line.strip_prefix("Chipset Model:") {
            gpu = value.trim().to_string();
        } else if line.starts_with("VRAM") {
            if let Some(value) = line.split(':').nth(1) {
                let parts: Vec<&str> = value.split_whitespace().collect();
                if let (Some(size), Some(unit)) = (parts.first(), parts.get(1)) {
                    if let Ok(size) = size.parse::<u32>() {
                        vram_gb = match unit.to_lowercase().as_str() {
                            "gb" => size,
                            "mb" => size / 1024,
                            _ => 0,
                        };
                    }
                }
            }
        }
    }
    if gpu.is_empty() {
        gpu = "Apple GPU".into();
    }
    if vram_gb == 0 && (gpu.starts_with("Apple") || cpu.contains("Apple")) {
        vram_gb = ram_gb;
    }
    let version = capture("sw_vers", &["-productVersion"]).trim().to_string();
    let (total, free) = df_root();
    Specs {
        cpu,
        cores: cores.max(1),
        threads: threads.max(1),
        ram_gb: ram_gb.max(1),
        gpu,
        vram_gb,
        disk_free_gb: free,
        disk_total_gb: total,
        os: format!("macOS {} {}", version, std::env::consts::ARCH),
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
fn probe_linux() -> Specs {
    let cpuinfo = std::fs::read_to_string("/proc/cpuinfo").unwrap_or_default();
    let cpu = cpuinfo
        .lines()
        .find_map(|l| l.strip_prefix("model name").map(|v| v.trim_start_matches([':', '\t', ' ']).to_string()))
        .or_else(|| cpuinfo.lines().find_map(|l| l.strip_prefix("Processor").map(|v| v.trim_start_matches([':', '\t', ' ']).to_string())))
        .unwrap_or_else(|| "CPU".into());
    let cores = cpuinfo
        .lines()
        .find_map(|l| l.strip_prefix("cpu cores").and_then(|v| v.split(':').nth(1)))
        .and_then(|v| v.trim().parse::<u32>().ok())
        .unwrap_or(1);
    let threads = capture("nproc", &[]).trim().parse().unwrap_or(cores);
    let mem_kb: u64 = std::fs::read_to_string("/proc/meminfo")
        .ok()
        .and_then(|raw| {
            raw.lines()
                .find(|l| l.starts_with("MemTotal:"))
                .and_then(|l| l.split_whitespace().nth(1).and_then(|v| v.parse().ok()))
        })
        .unwrap_or(0);
    let ram_gb = (mem_kb / 1_048_576) as u32;

    let lspci = capture("lspci", &[]);
    let gpu = lspci
        .lines()
        .find(|l| l.to_lowercase().contains("vga") || l.contains("3D controller") || l.contains("Display controller"))
        .and_then(|l| l.split_once(": ").map(|(_, v)| v.trim().to_string()))
        .unwrap_or_else(|| "GPU".into());

    let mut os = capture("uname", &["-sr"]).trim().to_string();
    if let Ok(release) = std::fs::read_to_string("/etc/os-release") {
        if let Some(pretty) = release.lines().find_map(|l| l.strip_prefix("PRETTY_NAME=")) {
            os = pretty.trim_matches('"').to_string();
        }
    }
    let (total, free) = df_root();
    Specs {
        cpu,
        cores: cores.max(1),
        threads: threads.max(1),
        ram_gb: ram_gb.max(1),
        gpu,
        vram_gb: 0,
        disk_free_gb: free,
        disk_total_gb: total,
        os: format!("{} {}", os, std::env::consts::ARCH).trim().to_string(),
    }
}

fn probe() -> Specs {
    #[cfg(windows)]
    {
        return probe_windows();
    }
    #[cfg(target_os = "macos")]
    {
        return probe_macos();
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        return probe_linux();
    }
    #[allow(unreachable_code)]
    Specs::default()
}

pub fn specs(refresh: bool) -> Specs {
    let mut guard = CACHE.lock().unwrap();
    if !refresh {
        if let Some((at, cached)) = guard.as_ref() {
            if at.elapsed() < TTL {
                return cached.clone();
            }
        }
    }
    let fresh = probe();
    *guard = Some((Instant::now(), fresh.clone()));
    fresh
}

/// Грубая, но честная классификация GPU по названию: точных данных о производительности
/// без бенчмарка получить нельзя, поэтому оценка консервативная.
fn gpu_tier(gpu: &str) -> &'static str {
    let g = gpu.to_lowercase();
    let ultra = [
        "rtx 5090", "rtx 5080", "rtx 4090", "rtx 4080", "rtx 3090", "rtx 3080",
        "rx 7900", "rx 6900", "rx 7800",
    ];
    let high = [
        "rtx 5070", "rtx 4070", "rtx 4060", "rtx 3070", "rtx 3060", "rtx 2080", "rtx 2070",
        "gtx 1080", "gtx 1070", "rx 6800", "rx 6700", "rx 7600", "rx 6600", "arc a7",
    ];
    let mid = [
        "gtx 1660", "gtx 1650", "gtx 1060", "gtx 1050", "rx 580", "rx 570", "rx 5500",
        "rx 6500", "arc a5", "iris xe", "radeon 680m", "radeon 780m",
    ];
    if ultra.iter().any(|k| g.contains(k)) {
        "ultra"
    } else if high.iter().any(|k| g.contains(k)) {
        "high"
    } else if mid.iter().any(|k| g.contains(k)) {
        "mid"
    } else {
        "entry"
    }
}

fn shaders_for(tier: &str) -> Vec<ShaderEstimate> {
    // 1080p, 16 чанков, Java Edition. Оценка по классу GPU, не замер.
    let table: [(u32, u32); 4] = match tier {
        "ultra" => [(900, 1400), (240, 330), (150, 210), (85, 120)],
        "high" => [(520, 820), (170, 240), (110, 160), (58, 82)],
        "mid" => [(260, 400), (95, 140), (60, 92), (30, 46)],
        _ => [(110, 180), (40, 62), (22, 36), (11, 18)],
    };
    let ids = ["none", "light", "balanced", "heavy"];
    ids.iter()
        .zip(table.iter())
        .map(|(id, (low, high))| ShaderEstimate {
            id: (*id).to_string(),
            fps_low: *low,
            fps_high: *high,
            verdict: if *high >= 100 {
                "easily"
            } else if *high >= 60 {
                "fine"
            } else if *high >= 40 {
                "tight"
            } else {
                "no"
            }
            .into(),
        })
        .collect()
}

pub fn recommend(specs: &Specs) -> Recommendation {
    let tier = gpu_tier(&specs.gpu);
    let ram = specs.ram_gb.max(4);
    // Современным модпакам редко нужно больше 6–8 ГБ: лишний heap только вредит GC,
    // поэтому держим запас для системы и не разгоняем значение на 32 ГБ.
    let memory_mb = match ram {
        0..=4 => 2048,
        5..=8 => 3072,
        9..=15 => 4096,
        16..=23 => 5120,
        24..=31 => 6144,
        _ => 6144,
    }
    .min(((ram * 1024) / 4).max(2048))
    .min(8192);

    let render_distance = match (tier, ram) {
        ("ultra", 32..=u32::MAX) => 24,
        ("ultra", _) | ("high", 24..=u32::MAX) => 20,
        ("high", _) | ("mid", 24..=u32::MAX) => 16,
        ("mid", _) => 12,
        _ => 8,
    };

    let (width, height) = if tier == "entry" { (1280, 720) } else { (1920, 1080) };

    Recommendation {
        tier: tier.to_string(),
        memory_mb,
        render_distance,
        width,
        height,
        shaders: shaders_for(tier),
    }
}

pub fn report(refresh: bool) -> Report {
    let specs = specs(refresh);
    let recommendation = recommend(&specs);
    Report {
        specs,
        recommendation,
    }
}
