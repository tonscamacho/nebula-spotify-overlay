import type {
  BrowseEntry,
  BrowseState,
  DetailData,
  LibraryItem,
  QueueItem,
  SearchResults,
  UserProfile,
} from "./types";

export const initialBrowse: BrowseState = { view: "library", stack: [], query: "" };

export function push(s: BrowseState, e: BrowseEntry): BrowseState {
  return { ...s, stack: [...s.stack, e] };
}

export function pop(s: BrowseState): BrowseState {
  return { ...s, stack: s.stack.slice(0, -1) };
}

export function switchView(s: BrowseState, view: BrowseState["view"]): BrowseState {
  return { ...s, view, stack: [] };
}

function img(images: unknown): string | null {
  if (!Array.isArray(images) || images.length === 0) return null;
  const mid = images[Math.min(1, images.length - 1)] as Record<string, unknown>;
  const first = images[0] as Record<string, unknown>;
  const pick = typeof mid["url"] === "string" ? mid : first;
  return typeof pick["url"] === "string" ? (pick["url"] as string) : null;
}

function artists(o: Record<string, unknown>): string {
  if (!Array.isArray(o["artists"])) return "";
  return (o["artists"] as Array<Record<string, unknown>>)
    .map((a) => (typeof a["name"] === "string" ? (a["name"] as string) : ""))
    .filter(Boolean)
    .join(", ");
}

function queueItem(o: Record<string, unknown>): QueueItem {
  return {
    name: typeof o["name"] === "string" ? (o["name"] as string) : "Unknown",
    artists: artists(o),
    durationMs: typeof o["duration_ms"] === "number" ? (o["duration_ms"] as number) : 0,
    uri: typeof o["uri"] === "string" ? (o["uri"] as string) : "",
  };
}

export function toLibraryItem(o: Record<string, unknown>, fallbackSubtitle = ""): LibraryItem {
  const owner = o["owner"] as Record<string, unknown> | undefined;
  return {
    id: typeof o["id"] === "string" ? (o["id"] as string) : "",
    name: typeof o["name"] === "string" ? (o["name"] as string) : "Unknown",
    subtitle:
      artists(o) ||
      (owner && typeof owner["display_name"] === "string"
        ? (owner["display_name"] as string)
        : fallbackSubtitle),
    image: img(o["images"]),
    uri: typeof o["uri"] === "string" ? (o["uri"] as string) : "",
  };
}

export function parsePlaylistPage(raw: unknown): { items: LibraryItem[]; total: number } {
  if (!raw || typeof raw !== "object") return { items: [], total: 0 };
  const o = raw as Record<string, unknown>;
  const list = Array.isArray(o["items"]) ? (o["items"] as Array<Record<string, unknown>>) : [];
  return {
    items: list.filter((i) => typeof i["id"] === "string").map((i) => toLibraryItem(i, "Playlist")),
    total: typeof o["total"] === "number" ? (o["total"] as number) : list.length,
  };
}

export function parseSavedAlbums(raw: unknown): { items: LibraryItem[]; total: number } {
  if (!raw || typeof raw !== "object") return { items: [], total: 0 };
  const o = raw as Record<string, unknown>;
  const list = Array.isArray(o["items"]) ? (o["items"] as Array<Record<string, unknown>>) : [];
  const items = list
    .map((w) => w["album"] as Record<string, unknown> | undefined)
    .filter((a): a is Record<string, unknown> => !!a && typeof a["id"] === "string")
    .map((a) => toLibraryItem(a, "Album"));
  return { items, total: typeof o["total"] === "number" ? (o["total"] as number) : items.length };
}

export function parseSavedTracks(raw: unknown): { items: QueueItem[]; total: number } {
  if (!raw || typeof raw !== "object") return { items: [], total: 0 };
  const o = raw as Record<string, unknown>;
  const list = Array.isArray(o["items"]) ? (o["items"] as Array<Record<string, unknown>>) : [];
  const items = list
    .map((w) => w["track"] as Record<string, unknown> | undefined)
    .filter((t): t is Record<string, unknown> => !!t && typeof t["uri"] === "string")
    .map(queueItem);
  return { items, total: typeof o["total"] === "number" ? (o["total"] as number) : items.length };
}

export function parseFollowedArtists(raw: unknown): { items: LibraryItem[]; after: string | null } {
  if (!raw || typeof raw !== "object") return { items: [], after: null };
  const o = raw as Record<string, unknown>;
  const artistsNode = o["artists"] as Record<string, unknown> | undefined;
  if (!artistsNode) return { items: [], after: null };
  const list = Array.isArray(artistsNode["items"])
    ? (artistsNode["items"] as Array<Record<string, unknown>>)
    : [];
  return {
    items: list.map((a) => toLibraryItem(a, "Artist")),
    after:
      typeof artistsNode["cursors"] === "object" &&
      artistsNode["cursors"] !== null &&
      typeof (artistsNode["cursors"] as Record<string, unknown>)["after"] === "string"
        ? ((artistsNode["cursors"] as Record<string, unknown>)["after"] as string)
        : null,
  };
}

export function parsePlaylistDetail(raw: unknown): DetailData | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o["id"] !== "string") return null;
  const owner = o["owner"] as Record<string, unknown> | undefined;
  const tracksNode = o["tracks"] as Record<string, unknown> | undefined;
  const list = tracksNode && Array.isArray(tracksNode["items"]) ? tracksNode["items"] : [];
  const tracks = (list as Array<Record<string, unknown>>)
    .map((w) => w["track"] as Record<string, unknown> | undefined)
    .filter((t): t is Record<string, unknown> => !!t && typeof t["uri"] === "string")
    .map(queueItem);
  return {
    kind: "playlist",
    name: typeof o["name"] === "string" ? (o["name"] as string) : "Playlist",
    image: img(o["images"]),
    owner:
      owner && typeof owner["display_name"] === "string"
        ? (owner["display_name"] as string)
        : "",
    tracks,
    uri: typeof o["uri"] === "string" ? (o["uri"] as string) : "",
  };
}

export function parseAlbumDetail(raw: unknown): DetailData | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o["id"] !== "string") return null;
  const tracksNode = o["tracks"] as Record<string, unknown> | undefined;
  const list = tracksNode && Array.isArray(tracksNode["items"]) ? tracksNode["items"] : [];
  const albumArtists = artists(o);
  const albumImage = img(o["images"]);
  const tracks = (list as Array<Record<string, unknown>>).map((t) =>
    queueItem({ ...t, artists: t["artists"] ?? o["artists"], uri: t["uri"] ?? "" }),
  );
  return {
    kind: "album",
    name: typeof o["name"] === "string" ? (o["name"] as string) : "Album",
    image: albumImage,
    artists: albumArtists,
    tracks,
    uri: typeof o["uri"] === "string" ? (o["uri"] as string) : "",
  };
}

export function parseArtistDetail(
  artist: unknown,
  top: unknown,
  albums: unknown,
): DetailData | null {
  if (!artist || typeof artist !== "object") return null;
  const o = artist as Record<string, unknown>;
  if (typeof o["id"] !== "string") return null;
  const topList =
    top && typeof top === "object" && Array.isArray((top as Record<string, unknown>)["tracks"])
      ? ((top as Record<string, unknown>)["tracks"] as Array<Record<string, unknown>>)
      : [];
  void albums;
  return {
    kind: "artist",
    name: typeof o["name"] === "string" ? (o["name"] as string) : "Artist",
    image: img(o["images"]),
    genres: Array.isArray(o["genres"])
      ? (o["genres"] as unknown[]).filter((g): g is string => typeof g === "string").slice(0, 3)
      : [],
    topTracks: topList.map(queueItem),
    uri: typeof o["uri"] === "string" ? (o["uri"] as string) : "",
  };
}

export function parseSearch(raw: unknown): SearchResults {
  const out: SearchResults = { tracks: [], artists: [], playlists: [], albums: [] };
  if (!raw || typeof raw !== "object") return out;
  const o = raw as Record<string, unknown>;
  const t = o["tracks"] as Record<string, unknown> | undefined;
  if (t && Array.isArray(t["items"])) {
    out.tracks = (t["items"] as Array<Record<string, unknown>>).slice(0, 5).map(queueItem);
  }
  const a = o["artists"] as Record<string, unknown> | undefined;
  if (a && Array.isArray(a["items"])) {
    out.artists = (a["items"] as Array<Record<string, unknown>>)
      .slice(0, 5)
      .map((x) => toLibraryItem(x, "Artist"));
  }
  const p = o["playlists"] as Record<string, unknown> | undefined;
  if (p && Array.isArray(p["items"])) {
    out.playlists = (p["items"] as Array<Record<string, unknown>>)
      .filter((x) => x && typeof x["id"] === "string")
      .slice(0, 5)
      .map((x) => toLibraryItem(x, "Playlist"));
  }
  const al = o["albums"] as Record<string, unknown> | undefined;
  if (al && Array.isArray(al["items"])) {
    out.albums = (al["items"] as Array<Record<string, unknown>>)
      .slice(0, 5)
      .map((x) => toLibraryItem(x, "Album"));
  }
  return out;
}

export function parseUserProfile(raw: unknown): UserProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o["id"] !== "string") return null;
  const followers = o["followers"] as Record<string, unknown> | undefined;
  return {
    id: o["id"] as string,
    name:
      typeof o["display_name"] === "string" && o["display_name"]
        ? (o["display_name"] as string)
        : (o["id"] as string),
    image: img(o["images"]),
    followers:
      followers && typeof followers["total"] === "number"
        ? (followers["total"] as number)
        : 0,
  };
}
