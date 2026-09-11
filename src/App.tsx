import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getCurrentWindow } from "@tauri-apps/api/window";
import PlayerPane from "./components/PlayerPane";
import LyricsPane from "./components/LyricsPane";
import QueuePane from "./components/QueuePane";
import VisualizerPane from "./components/VisualizerPane";
import BrowsePane from "./components/BrowsePane";
import SettingsModal from "./components/SettingsModal";
import {
  ListIcon,
  LockIcon,
  NoteIcon,
  SlidersIcon,
  UnlockIcon,
  XIcon,
} from "./components/icons";
import { api, parsePlayer } from "./lib/spotify";
import { initialBrowse } from "./lib/browse";
import type { TransLang } from "./lib/translate";
import {
  PRESETS,
  clampLayoutToArea,
  defaultLayoutFor,
  getPaneMin,
  loadLayout,
  saveLayout,
  snapMove,
  snapSize,
} from "./lib/layout";
import type {
  BrowseState,
  Density,
  DeviceInfo,
  LyricsState,
  PaneState,
  PaneType,
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

const PRESET_ORDER = ["minimal", "full", "lyrics", "spotlight"];
const PANE_TYPES: PaneType[] = ["player", "lyrics", "queue", "visualizer", "browse"];
type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const HANDLES: Handle[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

const PANE_TITLES: Record<PaneType, string> = {
  player: "Player",
  lyrics: "Lyrics",
  queue: "Queue",
  visualizer: "Visualizer",
  browse: "Browse",
};

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
  const [browse, setBrowse] = useState<BrowseState>(initialBrowse);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [layout, setLayout] = useState<PaneState[]>([]);
  const [preset, setPreset] = useState("full");
  const [interactive, setInteractive] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const [uiScale, setUiScale] = useState(1);
  const [clickToSeek, setClickToSeek] = useState(true);
  const [wordKaraoke, setWordKaraoke] = useState(() => {
    try {
      return localStorage.getItem("snapify-karaoke") !== "0";
    } catch {
      return true;
    }
  });
  const [transLang, setTransLang] = useState<TransLang>(() => {
    try {
      const v = localStorage.getItem("snapify-translang");
      return v === "es" || v === "fr" || v === "de" || v === "pt" || v === "ja"
        ? v
        : "off";
    } catch {
      return "off";
    }
  });
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    try {
      return localStorage.getItem("snapify-theme") === "light" ||
        localStorage.getItem("nebula-theme") === "light"
        ? "light"
        : "dark";
    } catch {
      return "dark";
    }
  });
  const [density, setDensity] = useState<Density>(() => {
    try {
      const v = localStorage.getItem("snapify-density");
      return v === "compact" || v === "spacious" ? v : "default";
    } catch {
      return "default";
    }
  });
  const [ambientTint, setAmbientTint] = useState(() => {
    try {
      return localStorage.getItem("snapify-ambient") !== "0";
    } catch {
      return true;
    }
  });
  const [autostart, setAutostart] = useState(false);

  const trackIdRef = useRef<string | null>(null);
  const snapRef = useRef<PlayerSnapshot>(EMPTY_SNAP);
  const uiScaleRef = useRef(1);

  useEffect(() => {
    snapRef.current = snap;
  }, [snap]);
  useEffect(() => {
    uiScaleRef.current = uiScale;
  }, [uiScale]);

  const dragRef = useRef<{
    id: string;
    kind: "move" | Handle;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
  } | null>(null);

  const persist = useCallback((panes: PaneState[], name: string) => {
    saveLayout({ version: 3, preset: name, panes });
  }, []);

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
      return true;
    } catch (e) {
      // A rejected session surfaces here first: drop the gate open.
      const m = e instanceof Error ? e.message : String(e);
      if (/not logged in|session expired|invalid_grant|refresh failed/i.test(m)) {
        setLoggedIn(false);
      }
      return false;
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
    const w = window.innerWidth || 1280;
    const hgt = window.innerHeight || 800;
    const saved = loadLayout();
    if (saved) {
      const clamped = clampLayoutToArea(saved, w, hgt, uiScaleRef.current);
      setLayout(clamped.panes);
      setPreset(saved.preset);
      if (clamped !== saved) persist(clamped.panes, saved.preset);
    } else {
      const fresh = defaultLayoutFor(w, hgt);
      setLayout(fresh.panes);
      setPreset(fresh.preset);
      persist(fresh.panes, fresh.preset);
    }
    invoke<boolean>("autostart_state").then(setAutostart).catch(() => {});
    void refreshAuth().then((ok) => {
      if (ok) {
        void fetchPlayer().then((alive) => {
          if (!alive) return;
          void fetchDevices();
          void fetchQueue();
        });
      }
    });
    const off1 = listen("auth-changed", () => {
      void refreshAuth().then((ok) => {
        if (ok) {
          void fetchPlayer().then((alive) => {
            if (!alive) return;
            void fetchDevices();
            void fetchQueue();
          });
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
  }, [refreshAuth, fetchPlayer, fetchDevices, fetchQueue, flashErr, persist]);

  // Player poll every 3 s while logged in. Skipped while the window is
  // hidden so a background overlay holds no CPU or network budget.
  useEffect(() => {
    if (!loggedIn) return;
    const t = window.setInterval(() => {
      if (!document.hidden) void fetchPlayer();
    }, 3000);
    const onVis = () => {
      if (!document.hidden) void fetchPlayer();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [loggedIn, fetchPlayer]);

  // Interpolation tick for progress and lyric sync. Paused while hidden.
  useEffect(() => {
    const t = window.setInterval(() => {
      if (!document.hidden) setNow(Date.now());
    }, 500);
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

  // Passive display mode stays visible on top but passes every mouse event
  // to the game or window below. Interactive mode takes input for presses,
  // drags, and settings. The window is never hidden on toggle, which is
  // what flashed exclusive-fullscreen games.
  useEffect(() => {
    const shouldIgnore = loggedIn && !interactive && !settingsOpen;
    void getCurrentWindow().setIgnoreCursorEvents(shouldIgnore).catch(() => {});
  }, [loggedIn, interactive, settingsOpen]);

  // In-app shortcuts. Shift+Tab, Ctrl+Alt+E/P/N arrive as Tauri events
  // from the global shortcuts even while focused, so they are handled only
  // there to avoid double-firing. This listener keeps Esc, the focused-only
  // preset cycle, and the legacy click-through key.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && interactive) {
        setInteractive(false);
        return;
      }
      if (!(e.ctrlKey && e.altKey)) return;
      const k = e.key.toLowerCase();
      if (k === "l") {
        e.preventDefault();
        cyclePreset();
      } else if (k === "c") {
        // Legacy binding: click-through toggle is now the interact toggle.
        e.preventDefault();
        setInteractive((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, preset, interactive]);

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
    setPreset((cur) => {
      const i = PRESET_ORDER.indexOf(cur);
      const next = PRESET_ORDER[(i + 1 + PRESET_ORDER.length) % PRESET_ORDER.length];
      const nl = PRESETS[next]();
      setLayout(clampLayoutToArea(nl, window.innerWidth, window.innerHeight, uiScaleRef.current).panes);
      persist(nl.panes, next);
      return next;
    });
  }, [persist]);

  const applyPreset = useCallback(
    (name: string) => {
      if (!PRESETS[name]) return;
      const nl = PRESETS[name]();
      const panes = clampLayoutToArea(nl, window.innerWidth, window.innerHeight, uiScaleRef.current).panes;
      setLayout(panes);
      setPreset(name);
      persist(panes, name);
    },
    [persist],
  );

  const setPaneOpacity = useCallback(
    (id: string, opacity: number) => {
      setLayout((l) => {
        const panes = l.map((x) => (x.id === id ? { ...x, opacity } : x));
        persist(panes, preset);
        return panes;
      });
    },
    [persist, preset],
  );

  const togglePaneType = useCallback(
    (type: PaneType) => {
      setLayout((l) => {
        const existing = l.find((x) => x.type === type);
        let panes: PaneState[];
        if (existing) {
          panes = l.map((x) => (x.type === type ? { ...x, visible: !x.visible } : x));
        } else {
          const z = l.reduce((m, x) => Math.max(m, x.z), 0) + 1;
          const n = l.length;
          const min = getPaneMin(type);
          panes = [
            ...l,
            {
              id: `${type}-${Date.now() % 100000}`,
              type,
              x: 40 + n * 32,
              y: 40 + n * 32,
              w: Math.max(min.w, type === "lyrics" ? 420 : type === "browse" ? 380 : 340),
              h: Math.max(min.h, type === "lyrics" ? 380 : type === "browse" ? 480 : 230),
              opacity: 0.92,
              visible: true,
              z,
            },
          ];
        }
        persist(panes, "custom");
        return panes;
      });
      setPreset("custom");
    },
    [persist],
  );

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
    const offToggle = listen("overlay-toggle-active", () => setInteractive((v) => !v));
    const offEdit = listen("shortcut-edit", () => setInteractive((v) => !v));
    const offTrayEdit = listen("tray-toggle-edit", () => setInteractive((v) => !v));
    const offTrayPreset = listen("tray-cycle-preset", () => cyclePreset());
    const offTraySettings = listen("tray-open-settings", () => setSettingsOpen(true));
    const all = [offPlay, offNext, offToggle, offEdit, offTrayEdit, offTrayPreset, offTraySettings];
    return () => {
      for (const off of all) void off.then((f) => f());
    };
  }, [run, cyclePreset]);

  // Pane drag + 8-handle resize. Deltas are divided by uiScale because the
  // stage renders under a zoom wrapper while pointer events stay in screen px.
  const beginDrag = (e: React.PointerEvent, id: string, kind: "move" | Handle) => {
    if (!interactive) return;
    e.stopPropagation();
    const pane = layout.find((x) => x.id === id);
    if (!pane) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    // Bring to front on grab.
    const top = layout.reduce((m, x) => Math.max(m, x.z), 0);
    dragRef.current = {
      id,
      kind,
      startX: e.clientX,
      startY: e.clientY,
      origX: pane.x,
      origY: pane.y,
      origW: pane.w,
      origH: pane.h,
    };
    if (pane.z < top) {
      setLayout((l) => {
        const panes = l.map((x) => (x.id === id ? { ...x, z: top + 1 } : x));
        return panes;
      });
    }
  };

  const onStageMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const k = uiScaleRef.current || 1;
    const dx = (e.clientX - d.startX) / k;
    const dy = (e.clientY - d.startY) / k;
    const stage = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const areaW = stage.width / k;
    const areaH = stage.height / k;
    setLayout((l) => {
      const panes = l.map((x) => ({ ...x }));
      const m = panes.find((x) => x.id === d.id);
      if (!m) return l;
      const min = getPaneMin(m.type);
      if (d.kind === "move") {
        m.x = Math.max(0, Math.round(d.origX + dx));
        m.y = Math.max(0, Math.round(d.origY + dy));
        if (!e.shiftKey) {
          const s = snapMove(m, panes, areaW, areaH);
          m.x = s.x;
          m.y = s.y;
          setGuides({ v: s.v, h: s.h });
        } else {
          setGuides({ v: [], h: [] });
        }
      } else {
        let nx = d.origX;
        let ny = d.origY;
        let nw = d.origW;
        let nh = d.origH;
        if (d.kind.includes("e")) nw = Math.max(min.w, Math.round(d.origW + dx));
        if (d.kind.includes("s")) nh = Math.max(min.h, Math.round(d.origH + dy));
        if (d.kind.includes("w")) {
          nx = Math.round(d.origX + dx);
          nw = Math.round(d.origW - dx);
          if (nw < min.w) {
            nx -= min.w - nw;
            nw = min.w;
          }
          nx = Math.max(0, nx);
        }
        if (d.kind.includes("n")) {
          ny = Math.round(d.origY + dy);
          nh = Math.round(d.origH - dy);
          if (nh < min.h) {
            ny -= min.h - nh;
            nh = min.h;
          }
          ny = Math.max(0, ny);
        }
        m.x = nx;
        m.y = ny;
        m.w = nw;
        m.h = nh;
        if (!e.shiftKey) {
          const s = snapSize(m, panes, areaW, areaH, {
            east: d.kind.includes("e"),
            south: d.kind.includes("s"),
            west: d.kind.includes("w"),
            north: d.kind.includes("n"),
          });
          m.x = Math.round(s.x);
          m.y = Math.round(s.y);
          m.w = Math.round(s.w);
          m.h = Math.round(s.h);
          setGuides({ v: s.gv, h: s.gh });
        } else {
          setGuides({ v: [], h: [] });
        }
      }
      return panes;
    });
  };

  const onStageUp = () => {
    if (dragRef.current) {
      dragRef.current = null;
      setGuides({ v: [], h: [] });
      setLayout((l) => {
        persist(l, preset);
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
    return (
      <section
        key={pane.id}
        className={`pane${interactive ? " editing" : ""}`}
        data-pane={pane.type}
        data-density={density}
        style={{ left: pane.x, top: pane.y, width: pane.w, height: pane.h, zIndex: pane.z, opacity: pane.opacity }}
        onPointerDown={(e) => {
          if (interactive) e.stopPropagation();
        }}
      >
        <header className="pane-handle" onPointerDown={(e) => beginDrag(e, pane.id, "move")}>
          <span className="pane-title">{PANE_TITLES[pane.type]}</span>
          {interactive && (
            <>
              <input
                className="pane-op"
                type="range"
                min={40}
                max={100}
                value={Math.round(pane.opacity * 100)}
                aria-label={`${PANE_TITLES[pane.type]} opacity`}
                title="Pane opacity"
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => setPaneOpacity(pane.id, Number(e.target.value) / 100)}
              />
              <span className="grip" aria-hidden="true" />
            </>
          )}
        </header>
        <div className="pane-body">
          {pane.type === "player" && (
            <PlayerPane
              snapshot={snap}
              devices={devices}
              progressMs={progressMs}
              busy={busy}
              ambientOn={ambientTint}
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
              wordKaraoke={wordKaraoke}
              transLang={transLang}
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
          {pane.type === "visualizer" && (
            <VisualizerPane isPlaying={snap.isPlaying} seed={snap.track?.id ?? null} />
          )}
          {pane.type === "browse" && (
            <BrowsePane
              state={browse}
              deviceId={snap.deviceId}
              onChange={setBrowse}
              onPlayContext={(uri) => void run(() => api.playContext(uri, snap.deviceId))}
              onPlayUris={(uris) => void run(() => api.playUris(uris, snap.deviceId))}
              onQueueAdd={(uri) =>
                void run(() => api.queueAdd(uri, snap.deviceId), () => {
                  void fetchQueue();
                })
              }
              onError={(m) => flashErr(m)}
            />
          )}
        </div>
        {interactive &&
          HANDLES.map((hh) => (
            <div
              key={hh}
              className={`rz rz-${hh}`}
              onPointerDown={(e) => beginDrag(e, pane.id, hh)}
            />
          ))}
      </section>
    );
  };

  return (
    <div className="app" data-theme={theme}>
      {!loggedIn ? (
        <div className="gate">
          <div className="pane gate-card" style={{ opacity: 0.97 }}>
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
          <div
            className="stage"
            onPointerMove={onStageMove}
            onPointerUp={onStageUp}
            onDoubleClick={(e) => {
              if (e.target === e.currentTarget) {
                setInteractive(false);
              }
            }}
          >
            {layout.map(renderPane)}
            {guides.v.map((x) => (
              <div key={`v${x}`} className="guide-v" style={{ left: x }} />
            ))}
            {guides.h.map((y) => (
              <div key={`h${y}`} className="guide-h" style={{ top: y }} />
            ))}
          </div>
        </div>
      )}

      {interactive && loggedIn && (
        <div className="dock" role="toolbar" aria-label="Overlay editor">
          <button
            className="tbtn"
            onClick={() => setInteractive(false)}
            title="Pass through to game (Esc)"
            aria-label="Pass through to game"
          >
            <LockIcon size={15} />
          </button>
          <button
            className="tbtn"
            onClick={cyclePreset}
            title="Cycle preset (Ctrl+Alt+L)"
            aria-label="Cycle preset"
          >
            <ListIcon size={15} />
          </button>
          <span className="dock-sep" aria-hidden="true" />
          {PANE_TYPES.map((t) => {
            const on = layout.some((p) => p.type === t && p.visible);
            return (
              <button
                key={t}
                className={`chip${on ? " chip-on" : ""}`}
                onClick={() => togglePaneType(t)}
                title={`Toggle ${PANE_TITLES[t]} pane`}
              >
                {PANE_TITLES[t]}
              </button>
            );
          })}
          <span className="dock-sep" aria-hidden="true" />
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
            onClick={() => setInteractive(false)}
            title="Pass through (Shift+Tab)"
            aria-label="Pass through to game"
          >
            <UnlockIcon size={15} />
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
      )}

      {err && <div className="toast">{err}</div>}

      <SettingsModal
        open={settingsOpen}
        loggedIn={loggedIn}
        preset={preset}
        uiScale={uiScale}
        theme={theme}
        density={density}
        ambientTint={ambientTint}
        autostart={autostart}
        interactive={interactive}
        clickToSeek={clickToSeek}
        wordKaraoke={wordKaraoke}
        transLang={transLang}
        onPreset={applyPreset}
        onUiScale={setUiScale}
        onTheme={(v) => {
          setTheme(v);
          try {
            localStorage.setItem("snapify-theme", v);
          } catch {
            // Private mode. Theme lasts the session.
          }
        }}
        onDensity={(v) => {
          setDensity(v);
          try {
            localStorage.setItem("snapify-density", v);
          } catch {
            // Private mode. Density lasts the session.
          }
        }}
        onAmbientTint={(v) => {
          setAmbientTint(v);
          try {
            localStorage.setItem("snapify-ambient", v ? "1" : "0");
          } catch {
            // Private mode. Choice lasts the session.
          }
        }}
        onAutostart={(v) => {
          setAutostart(v);
          invoke("set_autostart", { enabled: v }).catch((e) => {
            setAutostart(!v);
            flashErr(e instanceof Error ? e.message : String(e));
          });
        }}
        onInteractToggle={() => setInteractive((v) => !v)}
        onClickToSeek={setClickToSeek}
        onWordKaraoke={(v) => {
          setWordKaraoke(v);
          try {
            localStorage.setItem("snapify-karaoke", v ? "1" : "0");
          } catch {
            // Private mode. Choice lasts the session.
          }
        }}
        onTransLang={(v) => {
          setTransLang(v);
          try {
            localStorage.setItem("snapify-translang", v);
          } catch {
            // Private mode. Choice lasts the session.
          }
        }}
        onResetLayout={() => {
          const fresh = defaultLayoutFor(window.innerWidth, window.innerHeight);
          setLayout(fresh.panes);
          setPreset(fresh.preset);
          persist(fresh.panes, fresh.preset);
        }}
        onLogout={() => void logout()}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
