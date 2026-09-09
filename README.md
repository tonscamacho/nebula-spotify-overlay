# Nebula — Spotify Overlay

A lightweight, always-on-top Spotify overlay for Windows. Transparent glass panes you can drag, snap, and lock: player, synced lyrics, and queue. Built with Tauri v2, React, and Rust.

![Status](https://img.shields.io/badge/status-v0.1.0-blue) ![Tauri](https://img.shields.io/badge/tauri-v2-orange) ![License](https://img.shields.io/badge/license-MIT-green)

## What it does

- **Player pane** — cover art, now playing, progress with click-to-seek, play/pause/next/previous, volume, shuffle, repeat, device picker.
- **Lyrics pane** — line-synced lyrics with karaoke highlight, click a line to seek, auto-scroll, cached offline. Plain-lyrics, instrumental, and no-match states included.
- **Queue pane** — up-next list with refresh.
- **Snappable layout** — drag panes by their header in edit mode, magnet snap to edges and other panes (Shift bypasses), corner resize, three presets (minimal, full, lyrics), geometry persists across restarts.
- **Settings** — preset switch, pane opacity, UI scale, click-through-when-locked, click-lyric-to-seek, shortcuts reference.

## Stack

| Layer    | Choice                              |
| -------- | ----------------------------------- |
| Shell    | Tauri v2 (single `WebviewWindow`)   |
| UI       | React 19 + TypeScript + Vite, custom CSS glass theme |
| Auth     | Spotify Authorization Code + PKCE, no client secret in the app |
| Lyrics   | LRCLIB (`lrclib.net`), LRC parsed in Rust, cached locally |
| Secrets  | OS keychain via the `keyring` crate |

## Prerequisites

- Node 20+, Rust stable, [Spotify developer app](https://developer.spotify.com/dashboard).
- Spotify **Premium** for playback control. Free accounts get read-only state.
- In your Spotify app settings, allowlist this redirect URI exactly:

  ```
  http://127.0.0.1:3000
  ```

## Quickstart

```powershell
npm install
npm run tauri dev
```

Press **Login with Spotify**, approve in the browser, and play something. The overlay polls player state every 3 s and interpolates progress locally.

### Build a release binary

```powershell
npm run tauri build
```

Windows NSIS installers require the [WiX toolset](https://wixtoolset.org) on the build machine.

## Configuration

- `src-tauri/src/auth.rs` — `CLIENT_ID` and `REDIRECT_URI` constants. Replace the client ID with your own Spotify app's ID.
- Scopes requested: `user-read-playback-state`, `user-read-currently-playing`, `user-modify-playback-state`.

## Project structure

```
src-tauri/src/
  lib.rs      # commands, plugins, session restore
  auth.rs     # PKCE login, 127.0.0.1:3000 callback, token refresh, keychain
  spotify.rs  # Web API proxy: player, queue, devices
  lyrics.rs   # LRCLIB lookup, LRC parser, 500-track file cache
src/
  App.tsx            # shell, polling, drag/snap, shortcuts, top bar
  lib/spotify.ts     # response parsers + command wrappers
  lib/lrc.ts         # active-line binary search, time format
  lib/layout.ts      # presets, snap engine, localStorage persistence
  lib/types.ts       # Pane, PlayerSnapshot, LyricsData, QueueItem
  components/        # PlayerPane, LyricsPane, QueuePane, SettingsModal
```

## Shortcuts

| Keys         | Action              |
| ------------ | ------------------- |
| Ctrl+Alt+E   | Toggle edit lock    |
| Ctrl+Alt+L   | Cycle preset        |
| Ctrl+Alt+C   | Toggle click-through |

Click-through passes mouse events to windows below. Refocus the overlay from the taskbar and press Ctrl+Alt+C to exit it.

## Security notes

- Never commit a Spotify **Client Secret**. This app uses PKCE and needs none.
- Refresh tokens live in the OS credential store, never in `localStorage` or the bundle.
- If a secret or token is ever pasted into chat or committed, rotate it in the Spotify dashboard immediately.

## Roadmap

- v0.2 — tray icon, global hotkeys, installer, copy pass.
- v0.3 — album-art ambient tint, light preset, launch-on-login, release memory budget.
- v1.0 — visualizer pane, word-by-word karaoke, translations.

## Contributing

Issues and PRs welcome. Keep panes glanceable, keep the bundle light, and prove behavior changes with commands run plus before/after observations. MIT licensed.
