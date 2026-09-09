import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getCurrentWindow } from "@tauri-apps/api/window";
import PlayerPane from "./components/PlayerPane";
import LyricsPane from "./components/LyricsPane";
import QueuePane from "./components/QueuePane";
import SettingsModal from "./components/SettingsModal";
import {
  ListIcon,
  LockIcon,
  MinusIcon,
  NoteIcon,
  SlidersIcon,
  UnlockIcon,
  XIcon,
} from "./components/icons";
import { api, parsePlayer } from "./lib/spotify";
import { PRESETS, defaultLayout, loadLayout, saveLayout, snapPane } from "./lib/layout";
import type {
  DeviceInfo,
  LyricsState,
  PaneState,
  PlayerSnapshot,
  QueueItem,
} from "./lib/types";
import "./App.css";

const EMPTY_SNAP: PlayerSnapshot = {
  empty: true,
  isPlaying: false,
  progressMs: 0,
  fetchedAt: Date.now(),
  track: null,
  deviceId: null,
  deviceName: null,
  volume: null,
  shuffle: false,
  repeat: "off",
};

const PRESET_ORDER = ["minimal", "full", "lyrics"];

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [awaitingAuth, setAwaitingAuth] = useState(false);
  const [snap, setSnap] = useState<PlayerSnapshot>(EMPTY_SNAP);
  const [now, setNow] = useState(Date.now());
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [queue, setQueue] = useState<{ current: QueueItem | null; upcoming: QueueItem[] }>({
    current: null,
    upcoming: [],
  });
  const [queueLoading, setQueueLoading] = useState(false);
  const [lyrics, setLyrics] = useState<LyricsState>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [layout, setLayout] = useState(defaultLayout);
  const [editMode, setEditMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [opacity, setOpacity] = useState(0.92);
  const [uiScale, setUiScale] = useState(1);
  const [clickThrough, setClickThrough] = useState(false);
  const [clickToSeek, setClickToSeek] = useState(true);

  const trackIdRef = useRef<string | null>(null);
  const snapRef = useRef<PlayerSnapshot>(EMPTY_SNAP);

  useEffect(() => {
    snapRef.current = snap;
  }, [snap]);
  const dragRef = useRef<{
    id: string;
    mode: "move" | "resize";
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
  } | null>(null);

  const flashErr = useCallback((m: string) => {
    setErr(m);
    window.setTimeout(() => setErr((e) => (e === m ? null : e)), 6000);
  }, []);

  const refreshAuth = useCallback(async () => {
    try {
      const s = await api.authStatus();
      setLoggedIn(s.logged_in);
      setAwaitingAuth(s.awaiting_callback);
      return s.logged_in;
    } catch {
      return false;
    }
  }, []);

  const fetchPlayer = useCallback(async () => {
    try {
      const raw = await invoke<unknown>("get_player");
      setSnap(parsePlayer(raw));
    } catch {
      // Poll failure is routine when idle. Keep last snapshot.
    }
  }, []);

  const fetchQueue = useCallback(async () => {
    setQueueLoading(true);
    try {
      setQueue(await api.queue());
    } catch {
      // Leave previous queue in place.
    } finally {
      setQueueLoading(false);
    }
  }, []);

  const fetchDevices = useCallback(async () => {
    try {
      setDevices(await api.devices());
    } catch {
      // Leave previous list in place.
    }
  }, []);

  const fetchLyrics = useCallback(
    async (trackId: string) => {
      const t = snap.track;
      if (!t || t.id !== trackId) return;
      setLyrics({ kind: "loading" });
      try {
        const firstArtist = t.artists.split(",")[0]?.trim() || t.artists;
        const r = await api.lyrics({
          track_id: t.id,
          track_name: t.name,
          artist_name: firstArtist,
          album_name: t.album,
          duration_ms: t.durationMs,
        });
        setLyrics({
          kind: "ready",
          data: {
            trackId: r.trackId,
            synced: r.synced,
            instrumental: r.instrumental,
            cues: r.cues,
            plain: r.plain,
            cached: r.cached,
          },
        });
      } catch (e) {
        setLyrics({ kind: "error", message: e instanceof Error ? e.message : String(e) });
      }
    },
    [snap.track],
  );

  // Boot: layout, auth, listeners.
  useEffect(() => {
    setLayout(loadLayout());
    void refreshAuth().then((ok) => {
      if (ok) {
        void fetchPlayer();
        void fetchDevices();
        void fetchQueue();
      }
    });
    const off1 = listen("auth-changed", () => {
      void refreshAuth().then((ok) => {
        if (ok) {
          void fetchPlayer();
          void fetchDevices();
          void fetchQueue();
        } else {
          setSnap(EMPTY_SNAP);
          setLyrics({ kind: "idle" });
        }
      });
    });
    const off2 = listen("auth-error", (e) => flashErr(String(e.payload)));
    return () => {
      void off1.then((f) => f());
      void off2.then((f) => f());
    };
  }, [refreshAuth, fetchPlayer, fetchDevices, fetchQueue, flashErr]);

  // Player poll every 3 s while logged in.
  useEffect(() => {
    if (!loggedIn) return;
    const t = window.setInterval(fetchPlayer, 3000);
    return () => window.clearInterval(t);
  }, [loggedIn, fetchPlayer]);

  // Interpolation tick for progress and lyric sync.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, []);

  // Track change drives lyrics + queue refresh.
  useEffect(() => {
    const id = snap.track?.id ?? null;
    if (id !== trackIdRef.current) {
      trackIdRef.current = id;
      if (id) {
        void fetchLyrics(id);
        void fetchQueue();
      } else {
        setLyrics({ kind: "idle" });
      }
    }
  }, [snap.track, fetchLyrics, fetchQueue]);

  // Click-through follows lock state.
  const locked = !editMode;
  useEffect(() => {
    void getCurrentWindow()
      .setIgnoreCursorEvents(clickThrough && locked)
      .catch(() => {});
  }, [clickThrough, locked]);

  // In-app shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey && e.altKey)) return;
      const k = e.key.toLowerCase();
      if (k === "e") {
        e.preventDefault();
        setEditMode((v) => !v);
      } else if (k === "l") {
        e.preventDefault();
        cyclePreset();
      } else if (k === "c") {
        e.preventDefault();
        setClickThrough((v) => !v);
      } else if (k === "p") {
        e.preventDefault();
        const s = snapRef.current;
        if (s.track) {
          void run(s.isPlaying ? () => api.pause(s.deviceId) : () => api.play(s.deviceId));
        }
      } else if (k === "n") {
        e.preventDefault();
        if (snapRef.current.track) {
          void run(() => api.next(snapRef.current.deviceId));
        }
      } else if (k === "o") {
        e.preventDefault();
        void getCurrentWindow().hide();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  const run = useCallback(
    async (fn: () => Promise<unknown>, after?: () => void) => {
      setBusy(true);
      try {
        await fn();
        after?.();
        await fetchPlayer();
      } catch (e) {
        flashErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [fetchPlayer, flashErr],
  );

  const login = useCallback(async () => {
    try {
      const url = await api.startLogin();
      setAwaitingAuth(true);
      await openUrl(url);
    } catch (e) {
      flashErr(e instanceof Error ? e.message : String(e));
    }
  }, [flashErr]);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch (e) {
      flashErr(e instanceof Error ? e.message : String(e));
    }
  }, [flashErr]);

  const cyclePreset = useCallback(() => {
    setLayout((l) => {
      const next = PRESET_ORDER[(PRESET_ORDER.indexOf(l.preset) + 1) % PRESET_ORDER.length];
      const nl = PRESETS[next]();
      saveLayout(nl);
      return nl;
    });
  }, []);

  const applyPreset = useCallback((name: string) => {
    if (!PRESETS[name]) return;
    const nl = PRESETS[name]();
    saveLayout(nl);
    setLayout(nl);
  }, []);

  // Tray menu + global shortcuts arrive as events from Rust.
  useEffect(() => {
    const offPlay = listen("shortcut-playpause", () => {
      const s = snapRef.current;
      if (!s.track) return;
      void run(s.isPlaying ? () => api.pause(s.deviceId) : () => api.play(s.deviceId));
    });
    const offNext = listen("shortcut-next", () => {
      const s = snapRef.current;
      if (!s.track) return;
      void run(() => api.next(s.deviceId));
    });
    const offEdit = listen("shortcut-edit", () => setEditMode((v) => !v));
    const offTrayEdit = listen("tray-toggle-edit", () => setEditMode((v) => !v));
    const offTrayPreset = listen("tray-cycle-preset", () => cyclePreset());
    const offTraySettings = listen("tray-open-settings", () => setSettingsOpen(true));
    const all = [offPlay, offNext, offEdit, offTrayEdit, offTrayPreset, offTraySettings];
    return () => {
      for (const off of all) void off.then((f) => f());
    };
  }, [run, cyclePreset]);

  // Pane drag + resize.
  const onHandleDown = (e: React.PointerEvent, id: string) => {
    if (!editMode) return;
    const pane = layout.panes.find((x) => x.id === id);
    if (!pane) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      id,
      mode: "move",
      startX: e.clientX,
      startY: e.clientY,
      origX: pane.x,
      origY: pane.y,
      origW: pane.w,
      origH: pane.h,
    };
  };
  const onResizeDown = (e: React.PointerEvent, id: string) => {
    if (!editMode) return;
    e.stopPropagation();
    const pane = layout.panes.find((x) => x.id === id);
    if (!pane) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      id,
      mode: "resize",
      startX: e.clientX,
      startY: e.clientY,
      origX: pane.x,
      origY: pane.y,
      origW: pane.w,
      origH: pane.h,
    };
  };
  const onStageMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const stage = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setLayout((l) => {
      const panes = l.panes.map((x) => ({ ...x }));
      const m = panes.find((x) => x.id === d.id);
      if (!m) return l;
      if (d.mode === "move") {
        m.x = Math.max(0, d.origX + (e.clientX - d.startX));
        m.y = Math.max(0, d.origY + (e.clientY - d.startY));
        if (!e.shiftKey) {
          const s = snapPane(m, panes, stage.width, stage.height);
          m.x = s.x;
          m.y = s.y;
        } else {
          m.x = Math.round(m.x);
          m.y = Math.round(m.y);
        }
      } else {
        m.w = Math.max(240, Math.round(d.origW + (e.clientX - d.startX)));
        m.h = Math.max(120, Math.round(d.origH + (e.clientY - d.startY)));
      }
      return { ...l, panes };
    });
  };
  const onStageUp = () => {
    if (dragRef.current) {
      dragRef.current = null;
      setLayout((l) => {
        saveLayout(l);
        return l;
      });
    }
  };

  const progressMs = (() => {
    if (!snap.track) return 0;
    const base = snap.isPlaying ? snap.progressMs + (now - snap.fetchedAt) : snap.progressMs;
    return Math.min(Math.max(0, base), snap.track.durationMs);
  })();

  const repeatNext = snap.repeat === "off" ? "context" : snap.repeat === "context" ? "track" : "off";

  const renderPane = (pane: PaneState) => {
    if (!pane.visible) return null;
    const title = pane.type === "player" ? "Player" : pane.type === "lyrics" ? "Lyrics" : "Queue";
    return (
      <section
        key={pane.id}
        className={`pane${editMode ? " editing" : ""}`}
        style={{ left: pane.x, top: pane.y, width: pane.w, zIndex: pane.z }}
      >
        <header
          className="pane-handle"
          data-tauri-drag-region={editMode ? undefined : true}
          onPointerDown={(e) => onHandleDown(e, pane.id)}
        >
          <span className="pane-title">{title}</span>
          {editMode && <span className="grip" aria-hidden="true" />}
        </header>
        {pane.type === "player" && (
          <PlayerPane
            snapshot={snap}
            devices={devices}
            progressMs={progressMs}
            busy={busy}
            onPlay={() => void run(() => api.play(snap.deviceId))}
            onPause={() => void run(() => api.pause(snap.deviceId))}
            onNext={() => void run(() => api.next(snap.deviceId))}
            onPrev={() => void run(() => api.prev(snap.deviceId))}
            onSeek={(ms) => void run(() => api.seek(ms, snap.deviceId))}
            onVolume={(v) => {
              setSnap((s) => ({ ...s, volume: v }));
              void run(() => api.volume(v, snap.deviceId));
            }}
            onShuffle={() => void run(() => api.shuffle(!snap.shuffle, snap.deviceId))}
            onRepeat={() => void run(() => api.repeat(repeatNext, snap.deviceId))}
            onTransfer={(id) =>
              void run(() => api.transfer(id, true), () => {
                void fetchDevices();
              })
            }
            onRefreshDevices={() => void fetchDevices()}
          />
        )}
        {pane.type === "lyrics" && (
          <LyricsPane
            lyrics={lyrics}
            positionMs={progressMs}
            clickToSeek={clickToSeek}
            onSeek={(ms) => void run(() => api.seek(ms, snap.deviceId))}
            onRetry={() => trackIdRef.current && void fetchLyrics(trackIdRef.current)}
          />
        )}
        {pane.type === "queue" && (
          <QueuePane
            current={queue.current}
            upcoming={queue.upcoming}
            loading={queueLoading}
            onRefresh={() => void fetchQueue()}
          />
        )}
        {editMode && <div className="resize" onPointerDown={(e) => onResizeDown(e, pane.id)} />}
      </section>
    );
  };

  return (
    <div className="app" style={{ ["--pop" as string]: opacity }}>
      <div className="nebula" aria-hidden="true" />
      <div className="topbar" data-tauri-drag-region>
        <span className="brand">Nebula</span>
        <span className="divider" aria-hidden="true" />
        <span className="preset-name">{layout.preset}</span>
        <span className={`lock${locked ? " is-locked" : ""}`}>
          <i aria-hidden="true" />
          {locked ? "Locked" : "Edit"}
        </span>
        <div className="top-actions">
          <button
            className="tbtn"
            onClick={() => setEditMode((v) => !v)}
            title="Toggle edit (Ctrl+Alt+E)"
            aria-label="Toggle edit mode"
          >
            {locked ? <UnlockIcon size={15} /> : <LockIcon size={15} />}
          </button>
          <button
            className="tbtn"
            onClick={cyclePreset}
            title="Cycle preset (Ctrl+Alt+L)"
            aria-label="Cycle preset"
          >
            <ListIcon size={15} />
          </button>
          <button
            className="tbtn"
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            aria-label="Open settings"
          >
            <SlidersIcon size={15} />
          </button>
          <button
            className="tbtn"
            onClick={() => void getCurrentWindow().minimize()}
            title="Minimize"
            aria-label="Minimize"
          >
            <MinusIcon size={15} />
          </button>
          <button
            className="tbtn"
            onClick={() => void getCurrentWindow().close()}
            title="Close"
            aria-label="Close"
          >
            <XIcon size={15} />
          </button>
        </div>
      </div>

      {!loggedIn ? (
        <div className="gate">
          <div className="pane gate-card">
            <div className="gate-icon">
              <NoteIcon size={26} />
            </div>
            <h1>Connect Spotify</h1>
            <p>Login opens your browser, then returns here. Premium unlocks control.</p>
            <button className="btn primary" onClick={() => void login()} disabled={awaitingAuth}>
              {awaitingAuth ? "Waiting for browser…" : "Login with Spotify"}
            </button>
            {awaitingAuth && <p className="dim">Port 3000 listens once for the callback.</p>}
          </div>
        </div>
      ) : (
        <div style={{ zoom: uiScale } as React.CSSProperties}>
          <div className="stage" onPointerMove={onStageMove} onPointerUp={onStageUp}>
            {layout.panes.map(renderPane)}
          </div>
        </div>
      )}

      {err && <div className="toast">{err}</div>}

      <SettingsModal
        open={settingsOpen}
        loggedIn={loggedIn}
        preset={layout.preset}
        opacity={opacity}
        uiScale={uiScale}
        clickThrough={clickThrough}
        clickToSeek={clickToSeek}
        onPreset={applyPreset}
        onOpacity={setOpacity}
        onUiScale={setUiScale}
        onClickThrough={setClickThrough}
        onClickToSeek={setClickToSeek}
        onResetLayout={() => {
          const nl = PRESETS[layout.preset] ? PRESETS[layout.preset]() : defaultLayout();
          saveLayout(nl);
          setLayout(nl);
        }}
        onLogout={() => void logout()}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
