use reqwest::{Method, StatusCode};
use tauri::AppHandle;

use crate::auth;

fn api_url(path: &str) -> String {
    format!("https://api.spotify.com/v1{path}")
}

async fn call(
    app: &AppHandle,
    method: Method,
    path: &str,
    query: &[(&str, &str)],
    body: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let token = auth::access_token(app).await?;
    let res = send(method.clone(), path, query, body.clone(), &token).await?;
    if res.status() == StatusCode::UNAUTHORIZED {
        // Token died mid-session (clock skew, revocation). Refresh once and
        // retry before surfacing; refresh_now self-heals dead sessions.
        let fresh = auth::refresh_now(app).await?;
        let res = send(method, path, query, body, &fresh).await?;
        return interpret(res).await;
    }
    interpret(res).await
}

async fn send(
    method: Method,
    path: &str,
    query: &[(&str, &str)],
    body: Option<serde_json::Value>,
    token: &str,
) -> Result<reqwest::Response, String> {
    let client = reqwest::Client::new();
    let mut req = client
        .request(method, api_url(path))
        .bearer_auth(token)
        .query(query);
    if let Some(b) = body {
        req = req.json(&b);
    } else {
        // Spotify rejects bodiless PUT/POST/DELETE without an explicit
        // length as 411. reqwest omits Content-Length for an empty body,
        // so set it explicitly.
        req = req.header(reqwest::header::CONTENT_LENGTH, "0").body("");
    }
    req.send().await.map_err(|e| e.to_string())
}

async fn interpret(res: reqwest::Response) -> Result<serde_json::Value, String> {
    let status = res.status();
    if status == StatusCode::TOO_MANY_REQUESTS {
        let wait = res
            .headers()
            .get("retry-after")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("2");
        return Err(format!("rate-limited: retry after {wait}s"));
    }
    if status == StatusCode::NO_CONTENT || status == StatusCode::NOT_FOUND {
        return Ok(serde_json::json!({ "empty": true }));
    }
    if status == StatusCode::UNAUTHORIZED {
        return Err("unauthorized: token rejected".into());
    }
    if status == StatusCode::LENGTH_REQUIRED {
        return Err("spotify rejected the request length (411). Update the app and retry.".into());
    }
    if !status.is_success() {
        let body = res.text().await.unwrap_or_default();
        // Spotify gateway errors arrive as HTML pages. Trim them so the
        // overlay toast never dumps markup like the 411 page did.
        let short = body
            .replace(|c: char| c.is_whitespace(), " ")
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
        let short: String = short.chars().take(220).collect();
        return Err(format!("spotify {status}: {short}"));
    }
    let text = res.text().await.map_err(|e| e.to_string())?;
    if text.trim().is_empty() {
        return Ok(serde_json::json!({ "empty": true }));
    }
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_player(app: AppHandle) -> Result<serde_json::Value, String> {
    call(&app, Method::GET, "/me/player", &[], None).await
}

#[tauri::command]
pub async fn get_devices(app: AppHandle) -> Result<serde_json::Value, String> {
    call(&app, Method::GET, "/me/player/devices", &[], None).await
}

#[tauri::command]
pub async fn get_queue(app: AppHandle) -> Result<serde_json::Value, String> {
    call(&app, Method::GET, "/me/player/queue", &[], None).await
}

#[tauri::command]
pub async fn play(app: AppHandle, device_id: Option<String>) -> Result<serde_json::Value, String> {
    let q: Vec<(&str, &str)> = match &device_id {
        Some(d) => vec![("device_id", d.as_str())],
        None => vec![],
    };
    call(&app, Method::PUT, "/me/player/play", &q, None).await
}

#[tauri::command]
pub async fn pause(app: AppHandle, device_id: Option<String>) -> Result<serde_json::Value, String> {
    let q: Vec<(&str, &str)> = match &device_id {
        Some(d) => vec![("device_id", d.as_str())],
        None => vec![],
    };
    call(&app, Method::PUT, "/me/player/pause", &q, None).await
}

#[tauri::command]
pub async fn next_track(
    app: AppHandle,
    device_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let q: Vec<(&str, &str)> = match &device_id {
        Some(d) => vec![("device_id", d.as_str())],
        None => vec![],
    };
    call(&app, Method::POST, "/me/player/next", &q, None).await
}

#[tauri::command]
pub async fn prev_track(
    app: AppHandle,
    device_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let q: Vec<(&str, &str)> = match &device_id {
        Some(d) => vec![("device_id", d.as_str())],
        None => vec![],
    };
    call(&app, Method::POST, "/me/player/previous", &q, None).await
}

#[tauri::command]
pub async fn seek(
    app: AppHandle,
    position_ms: i64,
    device_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let pos = position_ms.to_string();
    let mut q = vec![("position_ms", pos.as_str())];
    if let Some(d) = &device_id {
        q.push(("device_id", d.as_str()));
    }
    call(&app, Method::PUT, "/me/player/seek", &q, None).await
}

#[tauri::command]
pub async fn set_volume(
    app: AppHandle,
    volume_percent: i64,
    device_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let vol = volume_percent.clamp(0, 100).to_string();
    let mut q = vec![("volume_percent", vol.as_str())];
    if let Some(d) = &device_id {
        q.push(("device_id", d.as_str()));
    }
    call(&app, Method::PUT, "/me/player/volume", &q, None).await
}

#[tauri::command]
pub async fn set_shuffle(
    app: AppHandle,
    enabled: bool,
    device_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let on = enabled.to_string();
    let mut q = vec![("state", on.as_str())];
    if let Some(d) = &device_id {
        q.push(("device_id", d.as_str()));
    }
    call(&app, Method::PUT, "/me/player/shuffle", &q, None).await
}

#[tauri::command]
pub async fn set_repeat(
    app: AppHandle,
    mode: String,
    device_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let mode = match mode.as_str() {
        "track" | "context" => mode,
        _ => "off".to_string(),
    };
    let mut q = vec![("state", mode.as_str())];
    if let Some(d) = &device_id {
        q.push(("device_id", d.as_str()));
    }
    call(&app, Method::PUT, "/me/player/repeat", &q, None).await
}

#[tauri::command]
pub async fn transfer_playback(
    app: AppHandle,
    device_id: String,
    play_now: bool,
) -> Result<serde_json::Value, String> {
    let body = serde_json::json!({ "device_ids": [device_id], "play": play_now });
    call(&app, Method::PUT, "/me/player", &[], Some(body)).await
}

#[tauri::command]
pub async fn add_to_queue(
    app: AppHandle,
    uri: String,
    device_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let mut q = vec![("uri", uri.as_str())];
    if let Some(d) = &device_id {
        q.push(("device_id", d.as_str()));
    }
    call(&app, Method::POST, "/me/player/queue", &q, None).await
}

fn clamp_page(limit: i64, offset: i64) -> (String, String) {
    (limit.clamp(1, 50).to_string(), offset.max(0).to_string())
}

async fn paged(
    app: &AppHandle,
    method: Method,
    path: &str,
    extra: &[(&str, &str)],
    limit: i64,
    offset: i64,
) -> Result<serde_json::Value, String> {
    let (ls, os) = clamp_page(limit, offset);
    let mut q = vec![("limit", ls.as_str()), ("offset", os.as_str())];
    for (k, v) in extra {
        q.push((k, v));
    }
    call(app, method, path, &q, None).await
}

#[tauri::command]
pub async fn get_me(app: AppHandle) -> Result<serde_json::Value, String> {
    call(&app, Method::GET, "/me", &[], None).await
}

#[tauri::command]
pub async fn get_user(app: AppHandle, user_id: String) -> Result<serde_json::Value, String> {
    call(&app, Method::GET, &format!("/users/{}", user_id), &[], None).await
}

#[tauri::command]
pub async fn get_my_playlists(
    app: AppHandle,
    limit: i64,
    offset: i64,
) -> Result<serde_json::Value, String> {
    paged(&app, Method::GET, "/me/playlists", &[], limit, offset).await
}

#[tauri::command]
pub async fn get_user_playlists(
    app: AppHandle,
    user_id: String,
    limit: i64,
    offset: i64,
) -> Result<serde_json::Value, String> {
    paged(
        &app,
        Method::GET,
        &format!("/users/{user_id}/playlists"),
        &[],
        limit,
        offset,
    )
    .await
}

#[tauri::command]
pub async fn get_my_tracks(
    app: AppHandle,
    limit: i64,
    offset: i64,
) -> Result<serde_json::Value, String> {
    paged(&app, Method::GET, "/me/tracks", &[], limit, offset).await
}

#[tauri::command]
pub async fn get_my_albums(
    app: AppHandle,
    limit: i64,
    offset: i64,
) -> Result<serde_json::Value, String> {
    paged(&app, Method::GET, "/me/albums", &[], limit, offset).await
}

#[tauri::command]
pub async fn get_followed_artists(
    app: AppHandle,
    limit: i64,
    after: Option<String>,
) -> Result<serde_json::Value, String> {
    let ls = limit.clamp(1, 50).to_string();
    let mut q = vec![("type", "artist"), ("limit", ls.as_str())];
    if let Some(a) = &after {
        q.push(("after", a.as_str()));
    }
    call(&app, Method::GET, "/me/following", &q, None).await
}

#[tauri::command]
pub async fn get_my_top(
    app: AppHandle,
    kind: String,
    limit: i64,
    offset: i64,
) -> Result<serde_json::Value, String> {
    let kind = match kind.as_str() {
        "tracks" => "tracks",
        _ => "artists",
    };
    paged(&app, Method::GET, &format!("/me/top/{kind}"), &[], limit, offset).await
}

#[tauri::command]
pub async fn get_recently_played(
    app: AppHandle,
    limit: i64,
) -> Result<serde_json::Value, String> {
    let ls = limit.clamp(1, 50).to_string();
    let q = [("limit", ls.as_str())];
    call(&app, Method::GET, "/me/player/recently-played", &q, None).await
}

#[tauri::command]
pub async fn get_playlist(app: AppHandle, playlist_id: String) -> Result<serde_json::Value, String> {
    call(
        &app,
        Method::GET,
        &format!("/playlists/{playlist_id}"),
        &[],
        None,
    )
    .await
}

#[tauri::command]
pub async fn get_playlist_tracks(
    app: AppHandle,
    playlist_id: String,
    limit: i64,
    offset: i64,
) -> Result<serde_json::Value, String> {
    paged(
        &app,
        Method::GET,
        &format!("/playlists/{playlist_id}/tracks"),
        &[],
        limit,
        offset,
    )
    .await
}

#[tauri::command]
pub async fn get_artist(app: AppHandle, artist_id: String) -> Result<serde_json::Value, String> {
    call(&app, Method::GET, &format!("/artists/{artist_id}"), &[], None).await
}

#[tauri::command]
pub async fn get_artist_top(
    app: AppHandle,
    artist_id: String,
) -> Result<serde_json::Value, String> {
    let q = [("market", "US")];
    call(
        &app,
        Method::GET,
        &format!("/artists/{artist_id}/top-tracks"),
        &q,
        None,
    )
    .await
}

#[tauri::command]
pub async fn get_artist_albums(
    app: AppHandle,
    artist_id: String,
    limit: i64,
    offset: i64,
) -> Result<serde_json::Value, String> {
    paged(
        &app,
        Method::GET,
        &format!("/artists/{artist_id}/albums"),
        &[("include_groups", "album,single")],
        limit,
        offset,
    )
    .await
}

#[tauri::command]
pub async fn get_album(app: AppHandle, album_id: String) -> Result<serde_json::Value, String> {
    call(&app, Method::GET, &format!("/albums/{album_id}"), &[], None).await
}

#[tauri::command]
pub async fn search(
    app: AppHandle,
    query: String,
    limit: i64,
) -> Result<serde_json::Value, String> {
    let q = query.trim().to_string();
    if q.is_empty() {
        return Ok(serde_json::json!({ "empty": true }));
    }
    let ls = limit.clamp(1, 10).to_string();
    let types = "track,artist,playlist,album";
    let qq = [
        ("q", q.as_str()),
        ("type", types),
        ("limit", ls.as_str()),
    ];
    call(&app, Method::GET, "/search", &qq, None).await
}

#[tauri::command]
pub async fn play_context(
    app: AppHandle,
    context_uri: String,
    device_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let q: Vec<(&str, &str)> = match &device_id {
        Some(d) => vec![("device_id", d.as_str())],
        None => vec![],
    };
    let body = serde_json::json!({ "context_uri": context_uri });
    call(&app, Method::PUT, "/me/player/play", &q, Some(body)).await
}

#[tauri::command]
pub async fn play_uris(
    app: AppHandle,
    uris: Vec<String>,
    device_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let q: Vec<(&str, &str)> = match &device_id {
        Some(d) => vec![("device_id", d.as_str())],
        None => vec![],
    };
    let body = serde_json::json!({ "uris": uris });
    call(&app, Method::PUT, "/me/player/play", &q, Some(body)).await
}
