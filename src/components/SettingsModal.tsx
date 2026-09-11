import { TRANS_LANGS, type TransLang } from "../lib/translate";
import type { Density } from "../lib/types";
import { XIcon } from "./icons";

interface Props {
  open: boolean;
  loggedIn: boolean;
  preset: string;
  uiScale: number;
  theme: "dark" | "light";
  density: Density;
  ambientTint: boolean;
  autostart: boolean;
  interactive: boolean;
  clickToSeek: boolean;
  wordKaraoke: boolean;
  transLang: TransLang;
  onPreset: (name: string) => void;
  onUiScale: (v: number) => void;
  onTheme: (v: "dark" | "light") => void;
  onDensity: (v: Density) => void;
  onAmbientTint: (v: boolean) => void;
  onAutostart: (v: boolean) => void;
  onInteractToggle: () => void;
  onClickToSeek: (v: boolean) => void;
  onWordKaraoke: (v: boolean) => void;
  onTransLang: (v: TransLang) => void;
  onResetLayout: () => void;
  onLogout: () => void;
  onClose: () => void;
}

export default function SettingsModal(p: Props) {
  if (!p.open) return null;
  return (
    <div className="modal-back" onClick={p.onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>Settings</span>
          <button className="icon-btn sm" onClick={p.onClose} aria-label="Close settings">
            <XIcon size={14} />
          </button>
        </div>
        <label className="row">
          <span>Spotify</span>
          {p.loggedIn ? (
            <button className="btn sm" onClick={p.onLogout}>
              Logout
            </button>
          ) : (
            <span className="dim">Logged out</span>
          )}
        </label>
        <label className="row">
          <span>Theme</span>
          <span className="seg">
            {(["dark", "light"] as const).map((n) => (
              <button
                key={n}
                className={p.theme === n ? "seg-on" : ""}
                onClick={() => p.onTheme(n)}
              >
                {n}
              </button>
            ))}
          </span>
        </label>
        <label className="row">
          <span>Density</span>
          <span className="seg">
            {(["compact", "default", "spacious"] as const).map((n) => (
              <button
                key={n}
                className={p.density === n ? "seg-on" : ""}
                onClick={() => p.onDensity(n)}
              >
                {n}
              </button>
            ))}
          </span>
        </label>
        <label className="row">
          <span>Album-art tint</span>
          <input
            type="checkbox"
            checked={p.ambientTint}
            onChange={(e) => p.onAmbientTint(e.target.checked)}
          />
        </label>
        <label className="row">
          <span>Preset</span>
          <span className="seg">
            {(["minimal", "full", "lyrics", "spotlight"] as const).map((n) => (
              <button
                key={n}
                className={p.preset === n ? "seg-on" : ""}
                onClick={() => p.onPreset(n)}
              >
                {n}
              </button>
            ))}
          </span>
        </label>
        <label className="row">
          <span>UI scale</span>
          <input
            type="range"
            min={85}
            max={130}
            value={Math.round(p.uiScale * 100)}
            onChange={(e) => p.onUiScale(Number(e.target.value) / 100)}
          />
        </label>
        <label className="row">
          <span>Launch on login</span>
          <input
            type="checkbox"
            checked={p.autostart}
            onChange={(e) => p.onAutostart(e.target.checked)}
          />
        </label>
        <label className="row">
          <span>{p.interactive ? "Mode: interactive" : "Mode: pass-through"}</span>
          <button className="btn sm" onClick={p.onInteractToggle}>
            {p.interactive ? "Pass through" : "Interact"}
          </button>
        </label>
        <div className="hint">
          Pass-through keeps the overlay visible on top while all mouse input
          goes to the game or window below. Press Shift+Tab, Ctrl+Alt+E, or
          use the tray to interact again. Mouse alone cannot re-enter while
          passing through.
        </div>
        <label className="row">
          <span>Click lyric to seek</span>
          <input
            type="checkbox"
            checked={p.clickToSeek}
            onChange={(e) => p.onClickToSeek(e.target.checked)}
          />
        </label>
        <label className="row">
          <span>Word-by-word karaoke</span>
          <input
            type="checkbox"
            checked={p.wordKaraoke}
            onChange={(e) => p.onWordKaraoke(e.target.checked)}
          />
        </label>
        <label className="row">
          <span>Lyric translation</span>
          <select
            className="device"
            style={{ flex: "none" }}
            value={p.transLang}
            aria-label="Lyric translation language"
            onChange={(e) => p.onTransLang(e.target.value as TransLang)}
          >
            {TRANS_LANGS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <div className="hint">
          Translations come from English via a free service, are cached per line, and
          stay silent when offline.
        </div>
        <label className="row">
          <span>Layout</span>
          <button className="btn sm" onClick={p.onResetLayout}>
            Reset
          </button>
        </label>
        <div className="hint">
          Each pane has its own opacity slider in its header while interactive
          (Shift+Tab, Ctrl+Alt+E, or the tray). Double-click empty canvas or
          Esc returns to pass-through.
        </div>
        <div className="hint">Shortcuts work everywhere, even over a game:</div>
        <div className="keys">
          <div>
            <span>Play / Pause</span>
            <span className="kbd">Ctrl+Alt+P</span>
          </div>
          <div>
            <span>Next track</span>
            <span className="kbd">Ctrl+Alt+N</span>
          </div>
          <div>
            <span>Interact / Pass through</span>
            <span className="kbd">Shift+Tab</span>
          </div>
          <div>
            <span>Edit lock</span>
            <span className="kbd">Ctrl+Alt+E</span>
          </div>
          <div>
            <span>Cycle preset (window focused)</span>
            <span className="kbd">Ctrl+Alt+L</span>
          </div>
          <div>
            <span>Interact toggle, legacy (window focused)</span>
            <span className="kbd">Ctrl+Alt+C</span>
          </div>
        </div>
      </div>
    </div>
  );
}
