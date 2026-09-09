import { useEffect, useRef } from "react";
import type { LyricsState } from "../lib/types";
import { activeCueIndex } from "../lib/lrc";

interface Props {
  lyrics: LyricsState;
  positionMs: number;
  clickToSeek: boolean;
  onSeek: (ms: number) => void;
  onRetry: () => void;
}

export default function LyricsPane(p: Props) {
  const activeRef = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useRef(
    typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  const active =
    p.lyrics.kind === "ready" && p.lyrics.data.synced
      ? activeCueIndex(p.lyrics.data.cues, p.positionMs)
      : -1;

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({
        block: "center",
        behavior: reduceMotion.current ? "auto" : "smooth",
      });
    }
  }, [active]);

  if (p.lyrics.kind === "idle") {
    return (
      <div className="pane-body">
        <div className="empty">
          <div className="empty-title">Lyrics wait for music</div>
          <div className="empty-sub">Play a track to fetch synced lyrics.</div>
        </div>
      </div>
    );
  }
  if (p.lyrics.kind === "loading") {
    return (
      <div className="pane-body">
        <div className="empty">
          <div className="empty-title">Finding lyrics…</div>
        </div>
      </div>
    );
  }
  if (p.lyrics.kind === "error") {
    return (
      <div className="pane-body">
        <div className="empty">
          <div className="empty-title">No synced lyrics</div>
          <div className="empty-sub">{p.lyrics.message}</div>
          <button className="btn" onClick={p.onRetry}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const d = p.lyrics.data;
  if (d.instrumental) {
    return (
      <div className="pane-body">
        <div className="empty">
          <div className="empty-title">♪ Instrumental</div>
          <div className="empty-sub">No words in this one.</div>
        </div>
      </div>
    );
  }
  if (!d.synced) {
    return (
      <div className="pane-body">
        <div className="lyrics-meta">Unsynced{d.cached ? " • cached" : ""}</div>
        <div className="plain">{d.plain ?? "Lyrics text unavailable."}</div>
      </div>
    );
  }
  return (
    <div className="pane-body">
      <div className="lyrics-meta">♪ Synced{d.cached ? " • cached" : ""}</div>
      <div className="lyrics">
        {d.cues.map((c, i) => (
          <div
            key={`${c.t}-${i}`}
            ref={i === active ? activeRef : undefined}
            className={i === active ? "line on" : i < active ? "line past" : "line"}
            onClick={p.clickToSeek ? () => p.onSeek(c.t) : undefined}
            title={p.clickToSeek ? "Seek to this line" : undefined}
          >
            {c.text === "" ? "· · ·" : c.text}
          </div>
        ))}
      </div>
    </div>
  );
}
