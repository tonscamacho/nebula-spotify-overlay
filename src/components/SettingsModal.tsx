import { useEffect, useRef, useState } from "react";
import { TRANS_LANGS, type TransLang } from "../lib/translate";
import type { Density } from "../lib/types";
import {
  KEYBIND_LABELS,
  KEYBIND_ORDER,
  KEYBIND_SCOPES,
  eventToAccelerator,
  type KeybindAction,
  type KeybindMap,
} from "../lib/keybinds";
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
  keybinds: KeybindMap;
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
  onKeybind: (action: KeybindAction, accelerator: string) => Promise<void>;
  onResetKeybinds: () => void;
  onLogout: () => void;
  onClose: () => void;
}

function KeybindRow({
  action,
  current,
  onKeybind,
}: {
  action: KeybindAction;
  current: string;
  onKeybind: (action: KeybindAction, accelerator: string) => Promise<void>;
}) {
  const [capturing, setCapturing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (capturing) btnRef.current?.focus();
  }, [capturing]);

  const cancel = () => {
    setCapturing(false);
    setError(null);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape" && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
      cancel();
      return;
    }
    const parsed = eventToAccelerator(e.nativeEvent);
    if (parsed === null) return;
    if (typeof parsed !== "string") {
      setError(parsed.error);
      return;
    }
    if (parsed === current) {
      cancel();
      return;
    }
    setSaving(true);
    setError(null);
    void onKeybind(action, parsed)
      .then(() => {
        setCapturing(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setSaving(false);
      });
  };

  return (
    <div>
      <span>
        {KEYBIND_LABELS[action]}
        <span className="scope">{KEYBIND_SCOPES[action] === "global" ? "global" : "focused"}</span>
      </span>
      <button
        ref={btnRef}
        className={`kbd kbd-btn${capturing ? " kbd-live" : ""}`}
        onClick={() => (capturing ? cancel() : (setError(null), setCapturing(true)))}
        onKeyDown={capturing ? onKeyDown : undefined}
        onBlur={capturing ? cancel : undefined}
        disabled={saving}
        title={capturing ? "Press the new shortcut, Esc to cancel" : "Click to remap"}
        aria-label={`Remap ${KEYBIND_LABELS[action]}`}
      >
        {saving ? "Saving…" : capturing ? "Press keys…" : current}
      </button>
      {error && <div className="key-err">{error}</div>}
    </div>
  );
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
          goes to the game or window below. Press {p.keybinds.toggleInteract},{" "}
          {p.keybinds.toggleEdit}, or use the tray to interact again. Mouse
          alone cannot re-enter while passing through.
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
          ({p.keybinds.toggleInteract}, {p.keybinds.toggleEdit}, or the tray).
          Double-click empty canvas or Esc returns to pass-through.
        </div>
        <label className="row">
          <span>Shortcuts</span>
          <button className="btn sm" onClick={p.onResetKeybinds}>
            Reset
          </button>
        </label>
        <div className="hint">
          Global shortcuts work everywhere, even over a game. Focused ones need
          the overlay focused. Click a binding, press the new keys, Esc cancels.
        </div>
        <div className="keys">
          {KEYBIND_ORDER.map((action) => (
            <KeybindRow
              key={action}
              action={action}
              current={p.keybinds[action]}
              onKeybind={p.onKeybind}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
