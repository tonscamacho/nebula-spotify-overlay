import { useState } from "react";
import type { DeviceInfo, PlayerSnapshot } from "../lib/types";
import { formatMs } from "../lib/lrc";

interface Props {
  snapshot: PlayerSnapshot;
  devices: DeviceInfo[];
  progressMs: number;
  busy: boolean;
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (ms: number) => void;
  onVolume: (v: number) => void;
  onShuffle: () => void;
  onRepeat: () => void;
  onTransfer: (id: string) => void;
  onRefreshDevices: () => void;
}

export default function PlayerPane(p: Props) {
  const [vol, setVol] = useState<number | null>(null);
  const s = p.snapshot;
  const track = s.track;
  const shownVol = vol ?? s.volume ?? 50;

  const commitSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!track || track.durationMs <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    p.onSeek(Math.round(ratio * track.durationMs));
  };

  return (
    <div className="pane-body">
      {!track ? (
        <div className="empty">
          <div className="empty-title">Nothing playing</div>
          <div className="empty-sub">Start playback in Spotify and it shows here.</div>
        </div>
      ) : (
        <>
          <div className="track-row">
            {track.image ? (
              <img className="cover" src={track.image} alt="" draggable={false} />
            ) : (
              <div className="cover cover-fallback">♪</div>
            )}
            <div className="track-meta">
              <div className="track-title" title={track.name}>
                {track.name} {track.explicit && <span className="badge">E</span>}
              </div>
              <div className="track-artist" title={track.artists}>
                {track.artists}
              </div>
            </div>
          </div>
          <div
            className="bar"
            role="slider"
            aria-label="Seek"
            aria-valuenow={Math.round(p.progressMs)}
            aria-valuemax={track.durationMs}
            onClick={commitSeek}
          >
            <i
              style={{
                width: `${track.durationMs > 0 ? Math.min(100, (p.progressMs / track.durationMs) * 100) : 0}%`,
              }}
            />
          </div>
          <div className="times">
            <span>{formatMs(p.progressMs)}</span>
            <span>{formatMs(track.durationMs)}</span>
          </div>
          <div className="btns">
            <button className="btn" onClick={p.onPrev} disabled={p.busy} aria-label="Previous">
              ⏮
            </button>
            {s.isPlaying ? (
              <button className="btn primary" onClick={p.onPause} disabled={p.busy} aria-label="Pause">
                ⏸ Pause
              </button>
            ) : (
              <button className="btn primary" onClick={p.onPlay} disabled={p.busy} aria-label="Play">
                ▶ Play
              </button>
            )}
            <button className="btn" onClick={p.onNext} disabled={p.busy} aria-label="Next">
              ⏭
            </button>
          </div>
          <div className="sub-row">
            <button
              className={`chip${s.shuffle ? " chip-on" : ""}`}
              onClick={p.onShuffle}
              title="Shuffle"
            >
              🔀
            </button>
            <button className={`chip${s.repeat !== "off" ? " chip-on" : ""}`} onClick={p.onRepeat} title={`Repeat: ${s.repeat}`}>
              🔁{s.repeat === "track" ? "1" : ""}
            </button>
            <input
              className="vol"
              type="range"
              min={0}
              max={100}
              value={shownVol}
              aria-label="Volume"
              onChange={(e) => setVol(Number(e.target.value))}
              onPointerUp={(e) => {
                p.onVolume(Number((e.target as HTMLInputElement).value));
                setVol(null);
              }}
            />
          </div>
          <div className="sub-row">
            <select
              className="device"
              value={s.deviceId ?? ""}
              aria-label="Playback device"
              onChange={(e) => e.target.value && p.onTransfer(e.target.value)}
            >
              <option value="" disabled>
                {s.deviceName ?? "Choose device"}
              </option>
              {p.devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.isActive ? " •" : ""}
                </option>
              ))}
            </select>
            <button className="chip" onClick={p.onRefreshDevices} title="Refresh devices">
              ⟳
            </button>
          </div>
        </>
      )}
    </div>
  );
}
