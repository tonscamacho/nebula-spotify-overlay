import { XIcon } from "./icons";

interface Props {
  open: boolean;
  loggedIn: boolean;
  preset: string;
  opacity: number;
  uiScale: number;
  clickThrough: boolean;
  clickToSeek: boolean;
  onPreset: (name: string) => void;
  onOpacity: (v: number) => void;
  onUiScale: (v: number) => void;
  onClickThrough: (v: boolean) => void;
  onClickToSeek: (v: boolean) => void;
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
          <span>Preset</span>
          <span className="seg">
            {(["minimal", "full", "lyrics"] as const).map((n) => (
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
          <span>Pane opacity</span>
          <input
            type="range"
            min={40}
            max={100}
            value={Math.round(p.opacity * 100)}
            onChange={(e) => p.onOpacity(Number(e.target.value) / 100)}
          />
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
          <span>Click through when locked</span>
          <input
            type="checkbox"
            checked={p.clickThrough}
            onChange={(e) => p.onClickThrough(e.target.checked)}
          />
        </label>
        <div className="hint">
          Click-through passes mouse events to windows below. Refocus this window from the
          taskbar and press Ctrl+Alt+C to turn it back off.
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
          <span>Layout</span>
          <button className="btn sm" onClick={p.onResetLayout}>
            Reset
          </button>
        </label>
        <div className="hint">Shortcuts: Ctrl+Alt+E lock, Ctrl+Alt+L preset, Ctrl+Alt+C click-through.</div>
      </div>
    </div>
  );
}
