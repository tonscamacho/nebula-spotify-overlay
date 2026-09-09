import { invoke } from "@tauri-apps/api/core";
import type { DeviceInfo, PlayerSnapshot, QueueItem, TrackInfo } from "./types";

function asTrack(item: unknown): TrackInfo | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  if (typeof o["id"] !== "string") return null;
  const artists = Array.isArray(o["artists"])
    ? (o["artists"] as Array<Record<string, unknown>>)
        .map((a) => (typeof a["name"] === "string" ? (a["name"] as string) : ""))
        .filter(Boolean)
        .join(", ")
    : "";
  const images = (o["album"] as Record<string, unknown> | undefined)?.["images"] as
    | Array<Record<string, unknown>>
    | undefined;
  const image =
    images && images.length > 0 && typeof images[0]["url"] === "string"
      ? (images[0]["url"] as string)
      : null;
  return {
    id: o["id"] as string,
    name: typeof o["name"] === "string" ? (o["name"] as string) : "Unknown",
    artists,
    album:
      typeof (o["album"] as Record<string, unknown> | undefined)?.["name"] === "string"
        ? ((o["album"] as Record<string, unknown>)["name"] as string)
        : "",
    image,
    durationMs: typeof o["duration_ms"] === "number" ? (o["duration_ms"] as number) : 0,
    uri: typeof o["uri"] === "string" ? (o["uri"] as string) : "",
    explicit: o["explicit"] === true,
  };
}

export function parsePlayer(raw: unknown): PlayerSnapshot {
  const fallback: PlayerSnapshot = {
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
  if (!raw || typeof raw !== "object") return fallback;
  const o = raw as Record<string, unknown>;
  if (o["empty"] === true || !o["item"]) return fallback;
  const device = o["device"] as Record<string, unknown> | undefined;
  return {
    empty: false,
    isPlaying: o["is_playing"] === true,
    progressMs: typeof o["progress_ms"] === "number" ? (o["progress_ms"] as number) : 0,
    fetchedAt: Date.now(),
    track: asTrack(o["item"]),
    deviceId:
      device && typeof device["id"] === "string" ? (device["id"] as string) : null,
    deviceName:
      device && typeof device["name"] === "string"
        ? (device["name"] as string)
        : null,
    volume:
      device && typeof device["volume_percent"] === "number"
        ? (device["volume_percent"] as number)
        : null,
    shuffle: o["shuffle_state"] === true,
    repeat: typeof o["repeat_state"] === "string" ? (o["repeat_state"] as string) : "off",
  };
}

export function parseDevices(raw: unknown): DeviceInfo[] {
  if (!raw || typeof raw !== "object") return [];
  const list = (raw as Record<string, unknown>)["devices"];
  if (!Array.isArray(list)) return [];
  return (list as Array<Record<string, unknown>>).map((d) => ({
    id: typeof d["id"] === "string" ? (d["id"] as string) : "",
    name: typeof d["name"] === "string" ? (d["name"] as string) : "Device",
    kind: typeof d["type"] === "string" ? (d["type"] as string) : "",
    isActive: d["is_active"] === true,
    volume: typeof d["volume_percent"] === "number" ? (d["volume_percent"] as number) : null,
  }));
}

function parseTrackLite(o: Record<string, unknown>): QueueItem {
  const artists = Array.isArray(o["artists"])
    ? (o["artists"] as Array<Record<string, unknown>>)
        .map((a) => (typeof a["name"] === "string" ? (a["name"] as string) : ""))
        .filter(Boolean)
        .join(", ")
    : "";
  return {
    name: typeof o["name"] === "string" ? (o["name"] as string) : "Unknown",
    artists,
    durationMs: typeof o["duration_ms"] === "number" ? (o["duration_ms"] as number) : 0,
    uri: typeof o["uri"] === "string" ? (o["uri"] as string) : "",
  };
}

export function parseQueue(raw: unknown): { current: QueueItem | null; upcoming: QueueItem[] } {
  const out = { current: null as QueueItem | null, upcoming: [] as QueueItem[] };
  if (!raw || typeof raw !== "object") return out;
  const o = raw as Record<string, unknown>;
  if (o["currently_playing"] && typeof o["currently_playing"] === "object") {
    out.current = parseTrackLite(o["currently_playing"] as Record<string, unknown>);
  }
  if (Array.isArray(o["queue"])) {
    out.upcoming = (o["queue"] as Array<Record<string, unknown>>)
      .slice(0, 10)
      .map(parseTrackLite);
  }
  return out;
}

export const api = {
  authStatus: () => invoke<{ logged_in: boolean; awaiting_callback: boolean }>("auth_status"),
  startLogin: () => invoke<string>("start_login"),
  logout: () => invoke<void>("logout"),
  autostartState: () => invoke<boolean>("autostart_state"),
  setAutostart: (enabled: boolean) => invoke<void>("set_autostart", { enabled }),
  player: async () => parsePlayer(await invoke<unknown>("get_player")),
  devices: async () => parseDevices(await invoke<unknown>("get_devices")),
  queue: async () => parseQueue(await invoke<unknown>("get_queue")),
  play: (device_id?: string | null) => invoke("play", { deviceId: device_id ?? null }),
  pause: (device_id?: string | null) => invoke("pause", { deviceId: device_id ?? null }),
  next: (device_id?: string | null) => invoke("next_track", { deviceId: device_id ?? null }),
  prev: (device_id?: string | null) => invoke("prev_track", { deviceId: device_id ?? null }),
  seek: (position_ms: number, device_id?: string | null) =>
    invoke("seek", { positionMs: position_ms, deviceId: device_id ?? null }),
  volume: (volume_percent: number, device_id?: string | null) =>
    invoke("set_volume", { volumePercent: Math.round(volume_percent), deviceId: device_id ?? null }),
  shuffle: (enabled: boolean, device_id?: string | null) =>
    invoke("set_shuffle", { enabled, deviceId: device_id ?? null }),
  repeat: (mode: string, device_id?: string | null) =>
    invoke("set_repeat", { mode, deviceId: device_id ?? null }),
  transfer: (device_id: string, play_now: boolean) =>
    invoke("transfer_playback", { deviceId: device_id, playNow: play_now }),
  lyrics: (p: {
    track_id: string;
    track_name: string;
    artist_name: string;
    album_name: string;
    duration_ms: number;
  }) =>
    invoke<{
      trackId: string;
      synced: boolean;
      instrumental: boolean;
      cues: Array<{ t: number; text: string }>;
      plain: string | null;
      cached: boolean;
    }>("get_lyrics", {
      trackId: p.track_id,
      trackName: p.track_name,
      artistName: p.artist_name,
      albumName: p.album_name,
      durationMs: p.duration_ms,
    }),
};
