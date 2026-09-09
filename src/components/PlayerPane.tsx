import { useEffect, useState } from "react";
import type { DeviceInfo, PlayerSnapshot } from "../lib/types";
import { formatMs } from "../lib/lrc";
import { sampleAmbient } from "../lib/ambient";
import {
  NextIcon,
  NoteIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  RefreshIcon,
  RepeatIcon,
  RepeatOneIcon,
  ShuffleIcon,
  VolumeIcon,
} from "./icons";

interface Props {
  snapshot: PlayerSnapshot;
  devices: DeviceInfo[];
  progressMs: number;
  busy: boolean;
  ambientOn: boolean;
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
  const [tint, setTint] = useState<string | null>(null);
  const s = p.snapshot;
  const track = s.track;
  const shownVol = vol ?? s.volume ?? 50;

  useEffect(() => {
    if (!p.ambientOn || !track?.image) {
      setTint(null);
      return;
    }
    let live = true;
    void sampleAmbient(track.image).then((c) => {
      if (live) setTint(c);
    });
    return () => {
      live = false;
    };
  }, [p.ambientOn, track?.image]);

  const commitSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!track || track.durationMs <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    p.onSeek(Math.round(ratio * track.durationMs));
  };

  if (!track) {
    return (
      <div className="pane-body">
        <div className="empty">
          <div className="empty-icon">
            <NoteIcon size={22} />
          </div>
          <div className="empty-title">Nothing playing</div>
          <div className="empty-sub">Start playback in Spotify and it shows here.</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`pane-body${tint ? " has-ambient" : ""}`}
      style={tint ? ({ "--ambient": tint } as React.CSSProperties) : undefined}
    >
      <div className="track-row">
        {track.image ? (
          <img className="cover" src={track.image} alt="" draggable={false} />
        ) : (
          <div className="cover cover-fallback">
            <NoteIcon size={22} />
          </div>
        )}
        <div className="track-meta">
          <div className="track-title" title={track.name}>
            {track.name}
          </div>
          <div className="track-artist" title={track.artists}>
            {track.explicit && <span className="badge">E</span>} {track.artists}
          </div>
        </div>
      </div>

      <div
        className="bar"
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
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
        <span>-{formatMs(Math.max(0, track.durationMs - p.progressMs))}</span>
      </div>

      <div className="transport">
        <button
          className={`icon-btn${s.shuffle ? " is-on" : ""}`}
          onClick={p.onShuffle}
          title="Shuffle"
          aria-label="Toggle shuffle"
          aria-pressed={s.shuffle}
        >
          <ShuffleIcon size={17} />
        </button>
        <button
          className="icon-btn"
          onClick={p.onPrev}
          disabled={p.busy}
          title="Previous"
          aria-label="Previous track"
        >
          <PrevIcon size={19} />
        </button>
        {s.isPlaying ? (
          <button
            className="play-disc"
            onClick={p.onPause}
            disabled={p.busy}
            title="Pause"
            aria-label="Pause"
          >
            <PauseIcon size={19} />
          </button>
        ) : (
          <button
            className="play-disc"
            onClick={p.onPlay}
            disabled={p.busy}
            title="Play"
            aria-label="Play"
          >
            <PlayIcon size={19} />
          </button>
        )}
        <button
          className="icon-btn"
          onClick={p.onNext}
          disabled={p.busy}
          title="Next"
          aria-label="Next track"
        >
          <NextIcon size={19} />
        </button>
        <button
          className={`icon-btn${s.repeat !== "off" ? " is-on" : ""}`}
          onClick={p.onRepeat}
          title={`Repeat: ${s.repeat}`}
          aria-label="Cycle repeat mode"
          aria-pressed={s.repeat !== "off"}
        >
          {s.repeat === "track" ? <RepeatOneIcon size={17} /> : <RepeatIcon size={17} />}
        </button>
      </div>

      <div className="device-row">
        <VolumeIcon size={14} />
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
        <select
          className="device"
          value={s.deviceId ?? ""}
          aria-label="Playback device"
          onChange={(e) => e.target.value && p.onTransfer(e.target.value)}
        >
          <option value="" disabled>
            {s.deviceName ?? "Device"}
          </option>
          {p.devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
              {d.isActive ? " — active" : ""}
            </option>
          ))}
        </select>
        <button
          className="icon-btn sm"
          onClick={p.onRefreshDevices}
          title="Refresh devices"
          aria-label="Refresh devices"
        >
          <RefreshIcon size={14} />
        </button>
      </div>
    </div>
  );
}
