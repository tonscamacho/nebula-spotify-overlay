export type PaneType = "player" | "lyrics" | "queue" | "visualizer";

export interface PaneState {
  id: string;
  type: PaneType;
  x: number;
  y: number;
  w: number;
  h: number;
  visible: boolean;
  z: number;
}

export interface LayoutState {
  version: 2;
  preset: string;
  panes: PaneState[];
}

export interface TrackInfo {
  id: string;
  name: string;
  artists: string;
  album: string;
  image: string | null;
  durationMs: number;
  uri: string;
  explicit: boolean;
}

export interface PlayerSnapshot {
  empty: boolean;
  isPlaying: boolean;
  progressMs: number;
  fetchedAt: number;
  track: TrackInfo | null;
  deviceId: string | null;
  deviceName: string | null;
  volume: number | null;
  shuffle: boolean;
  repeat: string;
}

export interface LyricCue {
  t: number;
  text: string;
}

export interface LyricsData {
  trackId: string;
  synced: boolean;
  instrumental: boolean;
  cues: LyricCue[];
  plain: string | null;
  cached: boolean;
}

export type LyricsState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; data: LyricsData }
  | { kind: "error"; message: string };

export interface QueueItem {
  name: string;
  artists: string;
  durationMs: number;
  uri: string;
}

export interface DeviceInfo {
  id: string;
  name: string;
  kind: string;
  isActive: boolean;
  volume: number | null;
}
