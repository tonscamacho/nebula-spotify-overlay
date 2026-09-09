use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager};

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct LyricCue {
    pub t: i64,
    pub text: String,
}

#[derive(Clone, serde::Serialize)]
pub struct LyricsResult {
    pub track_id: String,
    pub synced: bool,
    pub instrumental: bool,
    pub cues: Vec<LyricCue>,
    pub plain: Option<String>,
    pub cached: bool,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct CacheEntry {
    track_id: String,
    duration_ms: i64,
    synced: bool,
    instrumental: bool,
    cues: Vec<LyricCue>,
    plain: Option<String>,
    fetched_at: u64,
    negative: bool,
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn cache_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_local_data_dir()
        .ok()
        .map(|d| d.join("lyrics-cache.json"))
}

fn read_cache(app: &AppHandle) -> HashMap<String, CacheEntry> {
    let path = match cache_path(app) {
        Some(p) => p,
        None => return HashMap::new(),
    };
    let text = fs::read_to_string(path).unwrap_or_default();
    if text.is_empty() {
        return HashMap::new();
    }
    serde_json::from_str(&text).unwrap_or_default()
}

fn write_cache(app: &AppHandle, map: &HashMap<String, CacheEntry>) {
    if let Some(path) = cache_path(app) {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        // Cap at 500 entries, keep most recent.
        let mut entries: Vec<(&String, &CacheEntry)> = map.iter().collect();
        entries.sort_by_key(|(_, e)| e.fetched_at);
        let keep: HashMap<String, CacheEntry> = entries
            .into_iter()
            .rev()
            .take(500)
            .map(|(k, v)| {
                (
                    k.clone(),
                    CacheEntry {
                        track_id: v.track_id.clone(),
                        duration_ms: v.duration_ms,
                        synced: v.synced,
                        instrumental: v.instrumental,
                        cues: v.cues.clone(),
                        plain: v.plain.clone(),
                        fetched_at: v.fetched_at,
                        negative: v.negative,
                    },
                )
            })
            .collect();
        if let Ok(text) = serde_json::to_string(&keep) {
            let _ = fs::write(path, text);
        }
    }
}

fn cache_key(track_id: &str, duration_ms: i64) -> String {
    format!("spotify:{track_id}:{duration_ms}")
}

fn parse_timestamp(s: &str) -> Option<i64> {
    // mm:ss.xx or mm:ss.xxx
    let mut parts = s.split(':');
    let min: i64 = parts.next()?.parse().ok()?;
    let rest = parts.next()?;
    if parts.next().is_some() {
        return None;
    }
    let mut sec_parts = rest.split('.');
    let sec: i64 = sec_parts.next()?.parse().ok()?;
    let frac = sec_parts.next().unwrap_or("0");
    let ms: i64 = match frac.len() {
        0 => 0,
        1 => frac.parse::<i64>().ok()? * 100,
        2 => frac.parse::<i64>().ok()? * 10,
        _ => frac[..3].parse::<i64>().ok()?,
    };
    if sec_parts.next().is_some() {
        return None;
    }
    Some(min * 60_000 + sec * 1000 + ms)
}

/// Parses LRC text into sorted cues. Expands multi-tag lines, applies
/// [offset:+/-ms], drops ID tags and malformed lines.
pub fn parse_lrc(text: &str) -> Vec<LyricCue> {
    let mut cues: Vec<LyricCue> = Vec::new();
    let mut offset: i64 = 0;
    for raw_line in text.lines() {
        let line = raw_line.trim().trim_end_matches('\r');
        if line.is_empty() {
            continue;
        }
        // Global offset tag.
        if line.starts_with("[offset:") && line.ends_with(']') {
            if let Ok(v) = line[8..line.len() - 1].parse::<i64>() {
                offset = v;
            }
            continue;
        }
        // Collect leading [..] tags.
        let mut tags: Vec<String> = Vec::new();
        let mut rest = line;
        while rest.starts_with('[') {
            if let Some(end) = rest.find(']') {
                tags.push(rest[1..end].to_string());
                rest = rest[end + 1..].trim_start();
            } else {
                break;
            }
        }
        if tags.is_empty() {
            continue;
        }
        // Skip pure ID tags (ti, ar, al, au, length, by, re, ve).
        let times: Vec<i64> = tags.iter().filter_map(|t| parse_timestamp(t)).collect();
        if times.is_empty() {
            continue;
        }
        for t in times {
            cues.push(LyricCue {
                t: t + offset,
                text: rest.to_string(),
            });
        }
    }
    cues.sort_by_key(|c| c.t);
    cues
}

async fn lrclib_get(
    track: &str,
    artist: &str,
    album: &str,
    duration_secs: i64,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .user_agent("spotify-overlay/0.1.0 (desktop overlay)")
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    let res = client
        .get("https://lrclib.net/api/get")
        .query(&[
            ("track_name", track),
            ("artist_name", artist),
            ("album_name", album),
            ("duration", &duration_secs.to_string()),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if res.status() == reqwest::StatusCode::NOT_FOUND {
        return Err("not-found".into());
    }
    if res.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err("lyrics rate-limited".into());
    }
    if !res.status().is_success() {
        return Err(format!("lyrics lookup failed: {}", res.status()));
    }
    res.json().await.map_err(|e| e.to_string())
}

async fn lrclib_search(
    track: &str,
    artist: &str,
    album: &str,
    duration_ms: i64,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .user_agent("spotify-overlay/0.1.0 (desktop overlay)")
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    let res = client
        .get("https://lrclib.net/api/search")
        .query(&[
            ("track_name", track),
            ("artist_name", artist),
            ("album_name", album),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("lyrics search failed: {}", res.status()));
    }
    let list: Vec<serde_json::Value> = res.json().await.map_err(|e| e.to_string())?;
    // Closest duration wins.
    let mut best: Option<&serde_json::Value> = None;
    let mut best_gap = i64::MAX;
    for item in &list {
        let d = item
            .get("duration")
            .and_then(|v| v.as_f64())
            .map(|s| (s * 1000.0) as i64)
            .unwrap_or(0);
        let gap = (d - duration_ms).abs();
        if gap < best_gap {
            best_gap = gap;
            best = Some(item);
        }
    }
    match best {
        Some(v) if best_gap <= 10_000 => Ok(v.clone()),
        _ => Err("not-found".into()),
    }
}

fn entry_to_result(track_id: &str, e: &CacheEntry, cached: bool) -> LyricsResult {
    LyricsResult {
        track_id: track_id.to_string(),
        synced: e.synced,
        instrumental: e.instrumental,
        cues: e.cues.clone(),
        plain: e.plain.clone(),
        cached,
    }
}

fn value_to_entry(track_id: &str, duration_ms: i64, v: &serde_json::Value) -> CacheEntry {
    let instrumental = v
        .get("instrumental")
        .and_then(|b| b.as_bool())
        .unwrap_or(false);
    let synced_text = v
        .get("syncedLyrics")
        .and_then(|s| s.as_str())
        .unwrap_or("")
        .to_string();
    let plain = v
        .get("plainLyrics")
        .and_then(|s| s.as_str())
        .map(|s| s.to_string());
    let cues = if synced_text.trim().is_empty() {
        Vec::new()
    } else {
        parse_lrc(&synced_text)
    };
    CacheEntry {
        track_id: track_id.to_string(),
        duration_ms,
        synced: !cues.is_empty(),
        instrumental,
        cues,
        plain,
        fetched_at: now_unix(),
        negative: false,
    }
}

#[tauri::command]
pub async fn get_lyrics(
    app: AppHandle,
    track_id: String,
    track_name: String,
    artist_name: String,
    album_name: String,
    duration_ms: i64,
) -> Result<LyricsResult, String> {
    let key = cache_key(&track_id, duration_ms);
    let mut cache = read_cache(&app);
    if let Some(e) = cache.get(&key) {
        let age = now_unix().saturating_sub(e.fetched_at);
        let ttl_ok = if e.negative { age < 24 * 3600 } else { age < 30 * 24 * 3600 };
        if ttl_ok {
            return Ok(entry_to_result(&track_id, e, true));
        }
    }

    let duration_secs = duration_ms / 1000;
    let found = match lrclib_get(&track_name, &artist_name, &album_name, duration_secs).await {
        Ok(v) => Ok(v),
        Err(e) if e == "not-found" => {
            // Fallback: search and take the closest-duration candidate.
            lrclib_search(&track_name, &artist_name, &album_name, duration_ms).await
        }
        Err(e) => Err(e),
    };

    match found {
        Ok(v) => {
            let entry = value_to_entry(&track_id, duration_ms, &v);
            let result = entry_to_result(&track_id, &entry, false);
            cache.insert(key, entry);
            write_cache(&app, &cache);
            Ok(result)
        }
        Err(e) if e == "not-found" => {
            cache.insert(
                key,
                CacheEntry {
                    track_id: track_id.clone(),
                    duration_ms,
                    synced: false,
                    instrumental: false,
                    cues: Vec::new(),
                    plain: None,
                    fetched_at: now_unix(),
                    negative: true,
                },
            );
            write_cache(&app, &cache);
            Err("No lyrics found for this track yet.".into())
        }
        Err(e) => Err(e),
    }
}
