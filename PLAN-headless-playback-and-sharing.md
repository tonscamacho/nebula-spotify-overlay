# Plan: share Snapify with a friend + play without the Spotify app open

Use when: you paste this file back and say "run this plan". It tells the agent to do Part A first, then Part B. Do not skip verification steps.

## Goal

1. A friend runs Snapify on their Windows PC with their Spotify account.
2. Snapify plays music without the official Spotify desktop app open.

## Current state (do not re-discover)

- Snapify is Tauri v2 + React 19. Rust owns PKCE auth and a Web API proxy. React polls `get_player` every 3 s.
- Auth: `src-tauri/src/auth.rs:13` `CLIENT_ID`, `:15` `REDIRECT_URI=http://127.0.0.1:3000`, `:16-17` scopes. No client secret. Refresh token in OS keychain.
- Playback: `src-tauri/src/spotify.rs:6-64` proxies `https://api.spotify.com/v1/me/player...`. No `Spotify.Player`, no SDK tag in `index.html`. The Web API is a remote control. It needs an active device.
- Empty state proves it: `src/components/PlayerPane.tsx:64-75` says "Start playback in Spotify". `spotify.rs:100-102` maps 204/404 (no device) to `{empty:true}`.
- Build: `npm run tauri build` produces `src-tauri/target/release/bundle/nsis/Snapify - Spotify Overlay_1.0.0_x64-setup.exe`. Do not send `dist/` or raw `snapify-overlay.exe`. They lack the Rust backend.

## Decision

- Part A (now, effort S): share the existing installer + allowlist the friend in Development Mode. Cost $0.
- Part B (next, effort M): embed Spotify Web Playback SDK in the Tauri WebView2 view so the overlay registers its own Connect device. No Spotify app needed. Requires Premium on each account. Requires the webview to stay alive.
- Do not use librespot/spotifyd unless Web Playback SDK fails EME in WebView2. Reason: unofficial private API, ToS grey area, maintenance risk. Keep it as fallback.
- Do not switch services unless Spotify is dropped entirely. Apple Music MusicKit is the only clean official migration. YouTube Music is unofficial. TIDAL third-party is previews-only. Local files are trivial but lose catalog.

## Part A — friend runs it this week

### Owner does this

1. Open https://developer.spotify.com/dashboard. Select the app with ID `38bf5383c2a84de1a829a91ebd140421`.
2. Open Settings. Confirm Redirect URIs contains exactly `http://127.0.0.1:3000`. Add it if missing. Save.
3. Open Users Management. Add the friend with their Spotify signup name and email.
4. Run `npm run tauri build` on the build machine. WiX is required for MSI; NSIS exe is enough.
5. Send the friend `src-tauri/target/release/bundle/nsis/Snapify - Spotify Overlay_1.0.0_x64-setup.exe`.
6. Tell the friend: start playback in Spotify once, keep TCP 3000 free at login.

### Friend does this

1. Run the setup exe. Accept the SmartScreen prompt for the unsigned build. Launch Snapify.
2. Select Login with Spotify. Log in as the allowlisted account. Approve scopes.
3. Return to Snapify when the browser shows Connected. Play, pause, seek, change device.

### Verify Part A

- Friend sees cover art and progress after starting playback in Spotify.
- Friend presses play/pause/next/seek/volume and each acts on their account.
- Owner checks: no client secret shared, no tokens shared, each machine mints its own keychain entry.

### If Part A fails

- 403 on API calls: friend is not allowlisted. Add them, have them log out and log in.
- `INVALID_CLIENT` at login: redirect mismatch. Fix to exactly `http://127.0.0.1:3000`. `localhost` fails.
- "Port 3000 is busy": close the process on port 3000, retry.
- Free account: read-only state is expected. Playback control needs Premium.
- Owner Premium lapses: Development Mode app stops for all users until resubscribe (2026 rule).

## Part B — play without the Spotify app (Web Playback SDK)

### Prerequisites

- Each user holds Spotify Premium.
- Tauri uses WebView2 (Edge/Chromium) on Windows. This supplies EME/Widevine. Confirm before code.
- Spotify app stays in Development Mode. Owner stays Premium. Friend stays allowlisted.

### Build steps

1. Add the Web Playback SDK script to the frontend. Load `https://sdk.scdn.co/spotify-player.js`. Wait for `window.onSpotifyWebPlaybackSDKReady`.
2. Create a player module (for example `src/lib/player-sdk.ts`). It creates `new Spotify.Player({name, getOAuthToken, volume})`, wires `ready`, `not_ready`, `player_state_changed`, `initialization_error`, `authentication_error`, `account_error`, and calls `player.connect()`.
3. Supply tokens from the existing Rust auth. Add a Tauri command that returns a fresh access token (reuse `auth::access_token` logic, refresh if `expires_at-60 <= now`). Set token lifetime to max 60 minutes. Refresh before expiry.
4. On `ready` with `device_id`, call existing `transfer_playback` (`src-tauri/src/spotify.rs:246-254`) with `play:false` to register the overlay as the active device without stealing playback unexpectedly. Expose the SDK device in the existing device picker in `src/components/PlayerPane.tsx:181-220`.
5. Route transport to the SDK device by default. Keep Web API calls (`play/pause/next/seek/volume`) with explicit `device_id` set to the SDK device. Keep the 3 s `get_player` poll in `src/App.tsx:312-327` as the source of truth.
6. Handle autoplay policy. Create/resume the player inside a user gesture. Add `allow="encrypted-media; autoplay"` to any iframe that hosts the SDK. Keep the webview alive. A hidden or suspended view stops audio.
7. Test matrix: fresh login, token refresh at 60 minutes, transfer to overlay, transfer away and back, close Spotify app fully, reboot, offline loss, Free account error path.

### Verify Part B

- Close Spotify desktop and mobile fully. Press play in Snapify. Audio comes from the overlay device.
- Disconnect network for 10 s, reconnect. Player recovers or shows a named error.
- Reload with expired token. SDK re-authenticates without a second login.
- Record commands run, before/after observations, and side effects per the evidence bar.

### Fallback (only if SDK audio fails in WebView2)

1. Prototype a Rust sidecar with librespot as a Spotify Connect receiver. It needs Premium plus OAuth token with playback scopes.
2. Assess packaging, signing, and update risk. Note the repo disclaimer: use with Spotify API is probably forbidden. Note Developer Terms on reverse engineering.
3. Delete the prototype or promote it deliberately. Do not ship both players.

## Sources

- Web API needs active device + Premium: https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback
- Web Playback SDK creates a Connect device in the browser, needs Premium: https://developer.spotify.com/documentation/web-playback-sdk
- SDK reference (`connect`, token refresh): https://developer.spotify.com/documentation/web-playback-sdk/reference
- librespot README (Premium-only, Connect receiver): https://github.com/librespot-org/librespot/blob/dev/README.md
- Quota modes (Dev Mode allowlist, owner Premium): https://developer.spotify.com/documentation/web-api/concepts/quota-modes
- Feb 2026 migration guide: https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide
- PKCE flow (no secret): https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow
- Redirect URI (127.0.0.1 allowed, localhost banned): https://developer.spotify.com/documentation/web-api/concepts/redirect_uri
- Tauri distribute (`tauri build` bundles): https://v2.tauri.app/distribute/

## What this plan does not cover

- No live login, playback, or second-machine install was run to produce this plan.
- No EME audio test in WebView2 was run.
- No Dashboard state check for client `38bf...` was run. Owner confirms Premium status and allowlist count.
