# Snapify — Nebula Icon Pack

Original galaxy-themed mark for Snapify - Spotify Overlay (in-app brand: Snapify).
Spotify-esque in feel, not in artwork: no Spotify circle, no level bars, no green circle.

## Design

A deep-space disc (`circle r 480/1024`, transparent outside) holds a broken snap-ring tilted −18°,
three orbital sound-arcs shortening downward, and a four-point starfield with one
signal-green accent. Palette is taken from `src/App.css`:

- tile `#0A0C10` → `#11151D` → `#161C2B`, hairline `rgba(255,255,255,0.08)`
- nebula washes peak at indigo `#4C5CE0` 0.10 and violet `#8B5CF6` 0.07 (matches `.nebula`)
- signal `#1ED760` reserved for the snap-terminal dot and one accent star
- line work `#F4F6F8`

Small sizes are the same flat disc (`r 30/64`), drop gradients, and keep two bold sparkles so 16 px stays legible.
The mono tray mark is flat white on transparent and recolors to any theme.

Trademark note: this set is original artwork. It nods to sound waves in general,
not to the Spotify logo. Do not add three level bars in a green circle.

## Contents

- `svg/app-icon.svg` — full-color master disc, `viewBox 0 0 1024 1024`
- `svg/app-icon-small.svg` — flat small-size disc, `viewBox 0 0 64 64`
- `svg/app-icon-mono.svg` — one-color tray mark, `viewBox 0 0 32 32`
- `svg/ui/` — 17 in-app glyphs, `viewBox 0 0 24 24`, stroke 1.8 round caps
  (`play pause next prev shuffle repeat repeat-1 volume queue lyrics-mic
  settings lock unlock minimize close note refresh`)
- `png/` — sharp renders: `app-icon-{16,32,48,64,128,256,512,1024}.png`,
  Tauri aliases (`32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.png`),
  tray (`tray-{16,24,32}.png`)
- `tauri/` — `tauri icon` output from `app-icon-1024.png`: `icon.icns`,
  `icon.ico`, PNGs, `Square*Logo.png`, `StoreLogo.png`
- `app-icon-1024.png` — drop-in source if you run `tauri icon` again
- `preview.html` — offline gallery on dark and light

## Use

Preview first: open `preview.html` in a browser. No build step.

To adopt as the Tauri bundle icon later (explicit step, not done here):

```powershell
Copy-Item "icon pack\tauri\*" "src-tauri\icons\" -Force
```

`src-tauri/tauri.conf.json` already points at
`icons/32x32.png`, `icons/128x128.png`, `icons/128x128@2x.png`,
`icons/icon.icns`, `icons/icon.ico`, so no config change is needed.

To regenerate from the master:

```powershell
npx tauri icon "icon pack\app-icon-1024.png" -o "icon pack\tauri"
```

## Regeneration

`png/` was rendered from `svg/` with `sharp` (`resize fit contain`,
transparent background). The script used lives outside the repo and is not
checked in. `tauri/` was generated in an isolated temp dir so
`src-tauri/icons` and `src-tauri/gen` were never touched.
