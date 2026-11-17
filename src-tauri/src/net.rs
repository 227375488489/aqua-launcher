use anyhow::{anyhow, Result};
use futures::StreamExt;
use sha1::{Digest, Sha1};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
#[derive(Clone, Debug)]
pub struct Job {
    pub url: String,
    pub dest: PathBuf,
    pub sha1: Option<String>,
    pub size: Option<u64>,
}

impl Job {
    pub fn new(url: impl Into<String>, dest: PathBuf) -> Self {
        Self { url: url.into(), dest, sha1: None, size: None }
    }

    pub fn sha1(mut self, sha1: Option<String>) -> Self {
        self.sha1 = sha1.filter(|s| !s.is_empty());
        self
    }

    pub fn size(mut self, size: Option<u64>) -> Self {
        self.size = size;
        self
    }
}

pub fn hex(bytes: &[u8]) -> String {
    const TABLE: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push(TABLE[(b >> 4) as usize] as char);
        out.push(TABLE[(b & 0xf) as usize] as char);
    }
    out
}

pub fn sha1_file(path: &Path) -> Option<String> {
    let data = std::fs::read(path).ok()?;
    Some(hex(&Sha1::digest(&data)))
}

/// Downloads every job with a bounded number of parallel connections.
/// `progress(done_jobs, done_bytes)` is called from the worker futures.
pub async fn run(
    client: &reqwest::Client,
    jobs: Vec<Job>,
    workers: usize,
    progress: Arc<dyn Fn(usize, u64) + Send + Sync>,
) -> Result<()> {
    if jobs.is_empty() {
        return Ok(());
    }
    let client = client.clone();
    let total = jobs.len();
    let mut done = 0usize;
    let mut bytes = 0u64;
    let mut stream = futures::stream::iter(jobs.into_iter().map(|job| {
        let client = client.clone();
        async move { (fetch(&client, &job).await, job) }
    }))
    .buffer_unordered(workers.clamp(1, 64));

    while let Some((result, job)) = stream.next().await {
        done += 1;
        match result {
            Ok(n) => {
                bytes += n;
                progress(done.min(total), bytes);
            }
            Err(e) => {
                progress(done.min(total), bytes);
                return Err(e.context(format!("Не удалось скачать {}", job.url)));
            }
        }
    }
    Ok(())
}

async fn fetch(client: &reqwest::Client, job: &Job) -> Result<u64> {
    if let Ok(meta) = std::fs::metadata(&job.dest) {
        let len = meta.len();
        if len > 0 && job.size.map_or(true, |s| s == len) {
            return Ok(0);
        }
    }
    if let Some(parent) = job.dest.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let mut last = None;
    for attempt in 0..3u64 {
        match fetch_once(client, job).await {
            Ok(n) => return Ok(n),
            Err(e) => {
                last = Some(e);
                tokio::time::sleep(Duration::from_millis(300 * (attempt + 1))).await;
            }
        }
    }
    Err(last.unwrap_or_else(|| anyhow!("неизвестная ошибка")))
}

async fn fetch_once(client: &reqwest::Client, job: &Job) -> Result<u64> {
    use std::io::Write;
    let response = client.get(&job.url).send().await?.error_for_status()?;
    if let Some(parent) = job.dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = job.dest.with_extension("part");
    let mut file = std::fs::File::create(&tmp)?;
    let mut hasher = Sha1::new();
    let mut written = 0u64;
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        hasher.update(&chunk);
        file.write_all(&chunk)?;
        written += chunk.len() as u64;
    }
    file.flush()?;
    drop(file);
    if let Some(want) = &job.sha1 {
        let got = hex(&hasher.finalize());
        if !got.eq_ignore_ascii_case(want) {
            let _ = std::fs::remove_file(&tmp);
            return Err(anyhow!("SHA-1 не совпал"));
        }
    }
    std::fs::rename(&tmp, &job.dest)?;
    Ok(written)
}

/// Скачивает один файл потоком (без загрузки в память) с проверкой SHA-1.
pub async fn download_to(
    client: &reqwest::Client,
    url: &str,
    dest: PathBuf,
    sha1: Option<String>,
) -> Result<u64> {
    let job = Job::new(url, dest).sha1(sha1);
    fetch(client, &job).await
}
