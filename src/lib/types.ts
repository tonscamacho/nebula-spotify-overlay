export type PaneType = "player" | "lyrics" | "queue" | "visualizer" | "browse";

/** Row density preference. Compact saves vertical space in small
 *  panes, spacious airs out large ones. Orthogonal to pane size. */
export type Density = "compact" | "default" | "spacious";

export interface PaneState {
  id: string;
  type: PaneType;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Per-pane glass opacity, 0.4–1. Persisted in layout v3. */
  opacity: number;
  visible: boolean;
  z: number;
}

export interface LayoutState {
  version: 3;
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

export type BrowseView = "library" | "search" | "profile";

export type BrowseEntry =
  | { kind: "playlist"; id: string; name?: string }
  | { kind: "album"; id: string; name?: string }
  | { kind: "artist"; id: string; name?: string }
  | { kind: "profile"; id: string; name?: string };

export interface BrowseState {
  view: BrowseView;
  stack: BrowseEntry[];
  query: string;
}

export interface LibraryItem {
  id: string;
  name: string;
  subtitle: string;
  image: string | null;
  uri: string;
}

export type DetailData =
  | { kind: "playlist"; name: string; image: string | null; owner: string; tracks: QueueItem[]; uri: string }
  | { kind: "album"; name: string; image: string | null; artists: string; tracks: QueueItem[]; uri: string }
  | { kind: "artist"; name: string; image: string | null; genres: string[]; topTracks: QueueItem[]; uri: string };

export interface SearchResults {
  tracks: QueueItem[];
  artists: LibraryItem[];
  playlists: LibraryItem[];
  albums: LibraryItem[];
}

export interface UserProfile {
  id: string;
  name: string;
  image: string | null;
  followers: number;
}
