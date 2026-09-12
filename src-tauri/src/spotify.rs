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
    let retry_after = if status == StatusCode::TOO_MANY_REQUESTS {
        res.headers()
            .get("retry-after")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string())
    } else {
        None
    };
    let body = res.text().await.unwrap_or_default();
    decide(status, retry_after.as_deref(), &body)
}

fn trim_snippet(body: &str) -> String {
    // Spotify gateway errors arrive as HTML pages. Trim them so the
    // overlay toast never dumps markup like the 411 page did.
    let short = body
        .replace(|c: char| c.is_whitespace(), " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    short.chars().take(220).collect()
}

fn missing_scope(body: &str) -> Option<String> {
    // Spotify: {"error":{"status":403,"message":"Insufficient client scope: user-top-read"}}
    let marker = "Insufficient client scope:";
    let at = body.find(marker)?;
    body[at + marker.len()..]
        .split(|c| c == '"' || c == '\'' || c == '}' || c == ',')
        .map(str::trim)
        .find(|s| !s.is_empty())
        .filter(|s| s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'))
        .map(|s| s.to_string())
}

fn decide(
    status: StatusCode,
    retry_after: Option<&str>,
    body: &str,
) -> Result<serde_json::Value, String> {
    if status == StatusCode::TOO_MANY_REQUESTS {
        // Quota is shared per developer account and distinct from rate
        // limits. QUOTA_EXCEEDED backs off longer and never spins hot.
        if body.contains("QUOTA_EXCEEDED") || body.contains("quota") {
            return Err(format!(
                "quota-exceeded: developer quota hit, back off and retry after {}s. Detail reads run on demand only.",
                retry_after.unwrap_or("30")
            ));
        }
        return Err(format!(
            "rate-limited: retry after {}s",
            retry_after.unwrap_or("2")
        ));
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
        if status == StatusCode::FORBIDDEN {
            if let Some(scope) = missing_scope(body) {
                return Err(format!(
                    "spotify 403 Forbidden: missing permission \"{scope}\" — logout and login again to grant it"
                ));
            }
        }
        return Err(format!("spotify {status}: {}", trim_snippet(body)));
    }
    if body.trim().is_empty() {
        return Ok(serde_json::json!({ "empty": true }));
    }
    serde_json::from_str(body).map_err(|_| {
        format!(
            "spotify {status}: unexpected response (not JSON): {}",
            trim_snippet(body)
        )
    })
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
    // Self only. Do not rely on stale fields removed in Feb 2026:
    // popularity, followers, available_markets, label, publisher,
    // linked_from, country, product. Frontend uses id/display_name/images only.
    // Bulk `?ids=` is never called; callers loop singly with quota backoff.
    call(&app, Method::GET, "/me", &[], None).await
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
pub async fn create_playlist(
    app: AppHandle,
    name: String,
    public: bool,
) -> Result<serde_json::Value, String> {
    let body = serde_json::json!({ "name": name, "public": public });
    call(&app, Method::POST, "/me/playlists", &[], Some(body)).await
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
pub async fn get_my_shows(
    app: AppHandle,
    limit: i64,
    offset: i64,
) -> Result<serde_json::Value, String> {
    paged(&app, Method::GET, "/me/shows", &[], limit, offset).await
}

#[tauri::command]
pub async fn get_my_episodes(
    app: AppHandle,
    limit: i64,
    offset: i64,
) -> Result<serde_json::Value, String> {
    paged(&app, Method::GET, "/me/episodes", &[], limit, offset).await
}

#[tauri::command]
pub async fn get_my_audiobooks(
    app: AppHandle,
    limit: i64,
    offset: i64,
) -> Result<serde_json::Value, String> {
    paged(&app, Method::GET, "/me/audiobooks", &[], limit, offset).await
}

#[tauri::command]
pub async fn get_my_following(
    app: AppHandle,
    kind: String,
    limit: i64,
    after: Option<String>,
) -> Result<serde_json::Value, String> {
    let t = match kind.as_str() {
        "show" | "episode" | "audiobook" => kind,
        _ => "artist".to_string(),
    };
    let ls = limit.clamp(1, 50).to_string();
    let mut q = vec![("type", t.as_str()), ("limit", ls.as_str())];
    if let Some(a) = &after {
        q.push(("after", a.as_str()));
    }
    call(&app, Method::GET, "/me/following", &q, None).await
}

#[tauri::command]
pub async fn library_contains(
    app: AppHandle,
    kind: String,
    ids: Vec<String>,
) -> Result<serde_json::Value, String> {
    // Removed bulk `?ids=` loops singly with quota backoff: one id per
    // request, sequential, so a 429 backs off without losing place.
    let mut out = Vec::with_capacity(ids.len());
    for id in ids.iter().take(50) {
        let q = [("ids", id.as_str())];
        let path = match kind.as_str() {
            "album" => "/me/albums/contains",
            "episode" => "/me/episodes/contains",
            "audiobook" => "/me/audiobooks/contains",
            "show" => "/me/shows/contains",
            _ => "/me/tracks/contains",
        };
        match call(&app, Method::GET, path, &q, None).await {
            Ok(v) => {
                let flag = v.as_array().and_then(|a| a.first()).and_then(|x| x.as_bool()).unwrap_or(false);
                out.push(flag);
            }
            Err(e) if e.contains("quota-exceeded") || e.contains("rate-limited") => {
                return Err(e);
            }
            Err(e) => return Err(e),
        }
    }
    Ok(serde_json::Value::Array(out.into_iter().map(serde_json::Value::Bool).collect()))
}

#[tauri::command]
pub async fn library_save(
    app: AppHandle,
    kind: String,
    ids: Vec<String>,
) -> Result<serde_json::Value, String> {
    // Universal heart through PUT /me/library. Never save liked content locally.
    let body = serde_json::json!({ "ids": ids, "kind": kind });
    call(&app, Method::PUT, "/me/library", &[], Some(body)).await
}

#[tauri::command]
pub async fn library_remove(
    app: AppHandle,
    kind: String,
    ids: Vec<String>,
) -> Result<serde_json::Value, String> {
    let body = serde_json::json!({ "ids": ids, "kind": kind });
    call(&app, Method::DELETE, "/me/library", &[], Some(body)).await
}

#[tauri::command]
pub async fn follow_put(
    app: AppHandle,
    kind: String,
    ids: Vec<String>,
) -> Result<serde_json::Value, String> {
    let t = if kind == "show" || kind == "episode" { kind } else { "artist".to_string() };
    let q = [("type", t.as_str())];
    let body = serde_json::json!({ "ids": ids });
    call(&app, Method::PUT, "/me/following", &q, Some(body)).await
}

#[tauri::command]
pub async fn follow_delete(
    app: AppHandle,
    kind: String,
    ids: Vec<String>,
) -> Result<serde_json::Value, String> {
    let t = if kind == "show" || kind == "episode" { kind } else { "artist".to_string() };
    let q = [("type", t.as_str())];
    let body = serde_json::json!({ "ids": ids });
    call(&app, Method::DELETE, "/me/following", &q, Some(body)).await
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
pub async fn get_playlist_items(
    app: AppHandle,
    playlist_id: String,
    limit: i64,
    offset: i64,
) -> Result<serde_json::Value, String> {
    // New path: /playlists/{id}/items (param tracks -> items).
    paged(
        &app,
        Method::GET,
        &format!("/playlists/{playlist_id}/items"),
        &[],
        limit,
        offset,
    )
    .await
}

#[tauri::command]
pub async fn add_playlist_items(
    app: AppHandle,
    playlist_id: String,
    uris: Vec<String>,
) -> Result<serde_json::Value, String> {
    let body = serde_json::json!({ "uris": uris });
    call(
        &app,
        Method::POST,
        &format!("/playlists/{playlist_id}/items"),
        &[],
        Some(body),
    )
    .await
}

#[tauri::command]
pub async fn remove_playlist_items(
    app: AppHandle,
    playlist_id: String,
    uris: Vec<String>,
) -> Result<serde_json::Value, String> {
    let items: Vec<serde_json::Value> = uris.into_iter().map(|u| serde_json::json!({ "uri": u })).collect();
    let body = serde_json::json!({ "items": items });
    call(
        &app,
        Method::DELETE,
        &format!("/playlists/{playlist_id}/items"),
        &[],
        Some(body),
    )
    .await
}

#[tauri::command]
pub async fn reorder_playlist_items(
    app: AppHandle,
    playlist_id: String,
    range_start: i64,
    insert_before: i64,
    range_length: i64,
) -> Result<serde_json::Value, String> {
    let body = serde_json::json!({
        "range_start": range_start,
        "insert_before": insert_before,
        "range_length": range_length,
    });
    call(
        &app,
        Method::PUT,
        &format!("/playlists/{playlist_id}/items"),
        &[],
        Some(body),
    )
    .await
}

#[tauri::command]
pub async fn get_track(app: AppHandle, track_id: String) -> Result<serde_json::Value, String> {
    call(&app, Method::GET, &format!("/tracks/{track_id}"), &[], None).await
}

#[tauri::command]
pub async fn get_artist(app: AppHandle, artist_id: String) -> Result<serde_json::Value, String> {
    call(&app, Method::GET, &format!("/artists/{artist_id}"), &[], None).await
}

#[tauri::command]
pub async fn get_related_artists(
    app: AppHandle,
    artist_id: String,
) -> Result<serde_json::Value, String> {
    call(
        &app,
        Method::GET,
        &format!("/artists/{artist_id}/related-artists"),
        &[],
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
    // Always fetch explicit and URI types for badges and ±15s layouts.
    call(&app, Method::GET, &format!("/albums/{album_id}"), &[], None).await
}

#[tauri::command]
pub async fn get_album_tracks(
    app: AppHandle,
    album_id: String,
    limit: i64,
    offset: i64,
) -> Result<serde_json::Value, String> {
    paged(
        &app,
        Method::GET,
        &format!("/albums/{album_id}/tracks"),
        &[],
        limit,
        offset,
    )
    .await
}

#[tauri::command]
pub async fn get_show(app: AppHandle, show_id: String) -> Result<serde_json::Value, String> {
    call(&app, Method::GET, &format!("/shows/{show_id}"), &[], None).await
}

#[tauri::command]
pub async fn get_show_episodes(
    app: AppHandle,
    show_id: String,
    limit: i64,
    offset: i64,
) -> Result<serde_json::Value, String> {
    paged(
        &app,
        Method::GET,
        &format!("/shows/{show_id}/episodes"),
        &[],
        limit,
        offset,
    )
    .await
}

#[tauri::command]
pub async fn get_episode(app: AppHandle, episode_id: String) -> Result<serde_json::Value, String> {
    call(&app, Method::GET, &format!("/episodes/{episode_id}"), &[], None).await
}

#[tauri::command]
pub async fn get_audiobook(
    app: AppHandle,
    audiobook_id: String,
) -> Result<serde_json::Value, String> {
    call(&app, Method::GET, &format!("/audiobooks/{audiobook_id}"), &[], None).await
}

#[tauri::command]
pub async fn get_audiobook_chapters(
    app: AppHandle,
    audiobook_id: String,
    limit: i64,
    offset: i64,
) -> Result<serde_json::Value, String> {
    paged(
        &app,
        Method::GET,
        &format!("/audiobooks/{audiobook_id}/chapters"),
        &[],
        limit,
        offset,
    )
    .await
}

#[tauri::command]
pub async fn get_chapter(app: AppHandle, chapter_id: String) -> Result<serde_json::Value, String> {
    call(&app, Method::GET, &format!("/chapters/{chapter_id}"), &[], None).await
}

#[tauri::command]
pub async fn search(
    app: AppHandle,
    query: String,
    limit: i64,
    offset: i64,
) -> Result<serde_json::Value, String> {
    // Search capped: limit max 10, default 5, paginate by offset.
    // Shelves cap at 20 items downstream. Cache briefly, refresh on view.
    let q = query.trim().to_string();
    if q.is_empty() {
        return Ok(serde_json::json!({ "empty": true }));
    }
    let ls = limit.clamp(1, 10).to_string();
    let os = offset.max(0).to_string();
    let types = "album,artist,playlist,track,show,episode,audiobook";
    let qq = [
        ("q", q.as_str()),
        ("type", types),
        ("limit", ls.as_str()),
        ("offset", os.as_str()),
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

#[cfg(test)]
mod tests {
    use super::decide;
    use reqwest::StatusCode;

    #[test]
    fn serde_mechanism_matches_user_screenshot() {
        // Proves the pre-fix toast text came from this path: a non-JSON
        // 2xx body surfaces the raw serde error verbatim.
        let raw: Result<serde_json::Value, _> =
            serde_json::from_str("<html><body>gateway</body></html>");
        assert_eq!(
            raw.unwrap_err().to_string(),
            "expected value at line 1 column 1"
        );
    }

    #[test]
    fn html_body_on_success_does_not_leak_serde_error() {
        let err =
            decide(StatusCode::OK, None, "<html><body>gateway</body></html>").unwrap_err();
        assert!(
            !err.contains("line 1 column 1"),
            "raw serde error leaked: {err}"
        );
        assert!(err.contains("not JSON"), "unfriendly: {err}");
    }

    #[test]
    fn forbidden_names_missing_scope() {
        let body =
            r#"{"error":{"status":403,"message":"Insufficient client scope: user-top-read"}}"#;
        let err = decide(StatusCode::FORBIDDEN, None, body).unwrap_err();
        assert!(err.contains("user-top-read"), "scope lost: {err}");
        assert!(err.contains("login again"), "no action: {err}");
    }

    #[test]
    fn other_errors_keep_status_and_snippet() {
        let err =
            decide(StatusCode::BAD_GATEWAY, None, "<html>bad gateway</html>").unwrap_err();
        assert!(err.contains("502"), "status lost: {err}");
    }

    #[test]
    fn empty_success_stays_empty() {
        assert_eq!(
            decide(StatusCode::OK, None, "  ").unwrap(),
            serde_json::json!({"empty": true})
        );
    }

    #[test]
    fn rate_limit_uses_header() {
        assert_eq!(
            decide(StatusCode::TOO_MANY_REQUESTS, Some("7"), "").unwrap_err(),
            "rate-limited: retry after 7s"
        );
    }

    #[test]
    fn quota_exceeded_is_distinct_from_rate_limit() {
        let body = r#"{"error":{"status":429,"message":"QUOTA_EXCEEDED"}}"#;
        let err = decide(StatusCode::TOO_MANY_REQUESTS, Some("30"), body).unwrap_err();
        assert!(err.contains("quota-exceeded"), "quota lost: {err}");
        assert!(err.contains("30s"), "backoff lost: {err}");
    }
}
