import { useEffect, useRef } from "react";
import { NoteIcon } from "./icons";

interface Props {
  isPlaying: boolean;
  /** Changes per track so the motion signature follows the music. */
  seed: string | null;
}

const BARS = 40;

function hashSeed(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Ambient motion visualizer. The Spotify Web API exposes no audio
 * stream, so this renders a deterministic motion signature seeded by
 * the track: layered sines advance only while the track plays and
 * freeze on pause. One rAF loop, no allocations per frame, paused
 * while the window is hidden or the user prefers reduced motion.
 */
export default function VisualizerPane(p: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({ isPlaying: p.isPlaying, seed: hashSeed(p.seed ?? "idle") });

  stateRef.current.isPlaying = p.isPlaying;
  stateRef.current.seed = hashSeed(p.seed ?? "idle");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    let t = 0;
    let lastStatic = "";

    const draw = () => {
      const { seed } = stateRef.current;
      const playing = stateRef.current.isPlaying && !reduced;
      if (!playing) {
        // Paused or reduced-motion: one static frame per track, then idle.
        const sig = `static:${seed}`;
        if (sig === lastStatic) return;
        lastStatic = sig;
      }
      const parent = canvas.parentElement;
      const w = parent ? parent.clientWidth - 32 : 300;
      const h = 120;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const light = document.querySelector('.app[data-theme="light"]') !== null;
      const gap = 3;
      const bw = (w - gap * (BARS - 1)) / BARS;
      for (let i = 0; i < BARS; i += 1) {
        const ph = (seed % 360) * 0.017 + i * 0.55;
        const a = Math.sin(t * 1.7 + ph) * 0.5 + 0.5;
        const b = Math.sin(t * 3.1 + ph * 1.7 + i * 0.21) * 0.5 + 0.5;
        const idle = 0.12 + 0.1 * (0.5 + 0.5 * Math.sin(ph * 3));
        const level = playing ? 0.15 + 0.85 * (a * 0.65 + b * 0.35) : idle;
        const bh = Math.max(3, level * (h - 8));
        const x = i * (bw + gap);
        const y = (h - bh) / 2;
        ctx.fillStyle = light ? "rgba(20, 24, 31, 0.72)" : "rgba(244, 246, 248, 0.72)";
        ctx.beginPath();
        ctx.roundRect(x, y, bw, bh, 2);
        ctx.fill();
      }
      if (playing) t += 1 / 60;
    };

    draw();
    if (reduced) return;

    const loop = () => {
      if (!document.hidden) draw();
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(raf);
  }, []);

  if (!p.seed) {
    return (
      <div className="pane-body">
        <div className="empty">
          <div className="empty-icon">
            <NoteIcon size={22} />
          </div>
          <div className="empty-title">Visualizer waits for music</div>
          <div className="empty-sub">Play a track and it moves here.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="pane-body">
      <div className="viz-meta">
        <span>{p.isPlaying ? "Live" : "Paused"}</span>
        <span className="viz-dot" data-on={p.isPlaying ? "1" : "0"} aria-hidden="true" />
      </div>
      <canvas ref={canvasRef} className="viz" aria-label="Playback visualizer" role="img" />
      <div className="hint viz-hint">Motion follows playback. Still when paused.</div>
    </div>
  );
}
