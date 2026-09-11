import { useEffect, useRef, useState } from "react";
import type { LyricsState } from "../lib/types";
import { activeCueIndex } from "../lib/lrc";
import { translateLine, type TransLang } from "../lib/translate";
import { MicIcon, NoteIcon } from "./icons";

interface Props {
  lyrics: LyricsState;
  positionMs: number;
  clickToSeek: boolean;
  wordKaraoke: boolean;
  transLang: TransLang;
  onSeek: (ms: number) => void;
  onRetry: () => void;
}

function Meta({ children }: { children: React.ReactNode }) {
  return (
    <div className="lyrics-meta">
      <MicIcon size={11} />
      <span>{children}</span>
    </div>
  );
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

  const [trans, setTrans] = useState<string | null>(null);

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({
        block: "center",
        behavior: reduceMotion.current ? "auto" : "smooth",
      });
    }
  }, [active]);

  // Translation follows the active line. Failures stay silent: the
  // original line is always the source of truth.
  useEffect(() => {
    if (
      p.transLang === "off" ||
      active < 0 ||
      p.lyrics.kind !== "ready" ||
      !p.lyrics.data.synced
    ) {
      setTrans(null);
      return;
    }
    const line = p.lyrics.data.cues[active]?.text ?? "";
    let live = true;
    setTrans(null);
    if (line.trim()) {
      void translateLine(line, p.transLang).then((t) => {
        if (live) setTrans(t);
      });
    }
    return () => {
      live = false;
    };
  }, [active, p.transLang, p.lyrics]);

  if (p.lyrics.kind === "idle") {
    return (
      <>
        <div className="empty">
          <div className="empty-title">Lyrics wait for music</div>
          <div className="empty-sub">Play a track to fetch synced lyrics.</div>
        </div>
      </>
    );
  }
  if (p.lyrics.kind === "loading") {
    return (
      <>
        <div aria-label="Finding lyrics" role="status">
          <div className="skel skel-row" />
          <div className="skel skel-row" />
          <div className="skel skel-row" />
        </div>
      </>
    );
  }
  if (p.lyrics.kind === "error") {
    return (
      <>
        <div className="empty">
          <div className="empty-title">No synced lyrics</div>
          <div className="empty-sub">{p.lyrics.message}</div>
          <button className="btn" onClick={p.onRetry}>
            Retry
          </button>
        </div>
      </>
    );
  }

  const d = p.lyrics.data;
  if (d.instrumental) {
    return (
      <>
        <div className="empty">
          <div className="empty-icon">
            <NoteIcon size={22} />
          </div>
          <div className="empty-title">Instrumental</div>
          <div className="empty-sub">No words in this one.</div>
        </div>
      </>
    );
  }
  if (!d.synced) {
    return (
      <>
        <Meta>Unsynced{d.cached ? <span className="cached"> · Cached</span> : ""}</Meta>
        <div className="plain">{d.plain ?? "Lyrics text unavailable."}</div>
      </>
    );
  }
  return (
    <>
      <Meta>Synced{d.cached ? <span className="cached"> · Cached</span> : ""}</Meta>
      <div className="lyrics">
        {d.cues.map((c, i) => {
          const isActive = i === active;
          const blank = c.text === "";
          const karaoke = p.wordKaraoke && isActive && !blank;
          const end = d.cues[i + 1]?.t ?? c.t + 4000;
          const frac =
            karaoke && end > c.t
              ? Math.min(1, Math.max(0, (p.positionMs - c.t) / (end - c.t)))
              : 1;
          const words = karaoke ? c.text.split(" ") : [];
          const doneCount = karaoke ? Math.floor(frac * words.length) : words.length;
          return (
            <div
              key={`${c.t}-${i}`}
              ref={isActive ? activeRef : undefined}
              className={
                blank ? "line gap" : isActive ? "line on" : i < active ? "line past" : "line"
              }
              onClick={p.clickToSeek ? () => p.onSeek(c.t) : undefined}
              title={p.clickToSeek ? "Seek to this line" : undefined}
            >
              {karaoke ? (
                <>
                  {words.map((w, wi) => (
                    <span key={wi} className={wi < doneCount ? "w w-done" : "w"}>
                      {w}
                      {wi < words.length - 1 ? " " : ""}
                    </span>
                  ))}
                  {trans && <div className="trans">{trans}</div>}
                </>
              ) : blank ? (
                "···"
              ) : (
                c.text
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
