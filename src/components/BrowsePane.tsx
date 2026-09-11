import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/spotify";
import {
  parseArtistDetail,
  parseAlbumDetail,
  parseFollowedArtists,
  parsePlaylistDetail,
  parsePlaylistPage,
  parseSavedAlbums,
  parseSavedTracks,
  parseSearch,
  parseUserProfile,
  toLibraryItem,
} from "../lib/browse";
import { usePagedList } from "../lib/usePagedList";
import type {
  BrowseEntry,
  BrowseState,
  DetailData,
  LibraryItem,
  QueueItem,
  SearchResults,
  UserProfile,
} from "../lib/types";
import { formatMs } from "../lib/lrc";
import { RefreshIcon } from "./icons";

type LibTab = "playlists" | "albums" | "tracks" | "artists";

interface Props {
  state: BrowseState;
  deviceId: string | null;
  onChange: (s: BrowseState) => void;
  onPlayContext: (uri: string) => void;
  onPlayUris: (uris: string[]) => void;
  onQueueAdd: (uri: string) => void;
  onError: (m: string) => void;
}

function scopeHint(m: string): string | null {
  const missing =
    /missing permission "([^"]+)"/i.exec(m) ??
    /Insufficient client scope:\s*([A-Za-z0-9_-]+)/.exec(m);
  if (missing) {
    return `Spotify is missing permission “${missing[1]}”. Log out in Settings, then login again.`;
  }
  return /insufficient|scope|403/i.test(m)
    ? "Spotify needs new permissions. Log out in Settings, then login again."
    : null;
}

function Row({
  title,
  sub,
  image,
  right,
  onOpen,
  onPlay,
  onQueue,
}: {
  title: string;
  sub: string;
  image: string | null;
  right?: string;
  onOpen: () => void;
  onPlay?: () => void;
  onQueue?: () => void;
}) {
  return (
    <li className="q browse-row">
      <button className="browse-thumb" onClick={onOpen} aria-label={`Open ${title}`} title={title}>
        {image ? <img src={image} alt="" loading="lazy" /> : <span className="cover-fallback" aria-hidden="true" />}
      </button>
      <button className="q-name browse-name" onClick={onOpen} title={title}>
        {title}
        {sub && <small>{sub}</small>}
      </button>
      {right && <span className="q-time">{right}</span>}
      {onPlay && (
        <button className="icon-btn sm row-act" onClick={onPlay} title={`Play ${title}`} aria-label={`Play ${title}`}>
          ▶
        </button>
      )}
      {onQueue && (
        <button className="icon-btn sm row-act" onClick={onQueue} title={`Queue ${title}`} aria-label={`Queue ${title}`}>
          +
        </button>
      )}
    </li>
  );
}

function TrackRow({
  t,
  index,
  onPlay,
  onQueue,
}: {
  t: QueueItem;
  index?: number;
  onPlay?: () => void;
  onQueue?: () => void;
}) {
  return (
    <li className="q">
      {typeof index === "number" && (
        <span className="q-index">{String(index + 1).padStart(2, "0")}</span>
      )}
      <span className="q-name">
        {t.name}
        <small>{t.artists}</small>
      </span>
      <span className="q-time">{formatMs(t.durationMs)}</span>
      {onPlay && (
        <button
          className="icon-btn sm row-act"
          title={`Play ${t.name}`}
          aria-label={`Play ${t.name}`}
          onClick={onPlay}
        >
          ▶
        </button>
      )}
      {onQueue && (
        <button
          className="icon-btn sm row-act"
          title={`Queue ${t.name}`}
          aria-label={`Queue ${t.name}`}
          onClick={() => onQueue()}
        >
          +
        </button>
      )}
    </li>
  );
}

function Skeletons({ n = 3 }: { n?: number }) {
  return (
    <div aria-label="Loading" role="status">
      {Array.from({ length: n }, (_, i) => (
        <div className="skel skel-row" key={i} />
      ))}
    </div>
  );
}

function MoreSentinel({
  list,
}: {
  list: { loading: boolean; hasMore: boolean; sentinelRef: React.RefCallback<HTMLDivElement> };
}) {
  return (
    <li className="sentinel" aria-hidden="true">
      <div ref={list.sentinelRef} />
      {list.loading && list.hasMore && <div className="skel skel-row" />}
    </li>
  );
}

/** Paged library: playlists, albums, liked songs, followed artists.
 *  Mounted only on the library view so background tabs cost nothing. */
function LibraryList({
  tab,
  resetKey,
  onOpen,
  onPlayContext,
  onPlayUris,
  onQueueAdd,
  onError,
}: {
  tab: LibTab;
  resetKey: string;
  onOpen: (e: BrowseEntry) => void;
  onPlayContext: (uri: string) => void;
  onPlayUris: (uris: string[]) => void;
  onQueueAdd: (uri: string) => void;
  onError: (m: string) => void;
}) {
  const err = useCallback((m: string) => onError(scopeHint(m) ?? m), [onError]);
  const list = usePagedList<LibraryItem | QueueItem, number | string>(
    async (limit, cursor) => {
      if (tab === "playlists") {
        const off = typeof cursor === "number" ? cursor : 0;
        const parsed = parsePlaylistPage(await api.myPlaylists(limit, off));
        const next = off + parsed.items.length < parsed.total ? off + parsed.items.length : null;
        return { items: parsed.items, next };
      }
      if (tab === "albums") {
        const off = typeof cursor === "number" ? cursor : 0;
        const parsed = parseSavedAlbums(await api.savedAlbums(limit, off));
        const next = off + parsed.items.length < parsed.total ? off + parsed.items.length : null;
        return { items: parsed.items, next };
      }
      if (tab === "tracks") {
        const off = typeof cursor === "number" ? cursor : 0;
        const parsed = parseSavedTracks(await api.savedTracks(limit, off));
        const next = off + parsed.items.length < parsed.total ? off + parsed.items.length : null;
        return { items: parsed.items, next };
      }
      const parsed = parseFollowedArtists(
        await api.followedArtists(limit, typeof cursor === "string" ? cursor : null),
      );
      return { items: parsed.items, next: parsed.after };
    },
    { pageSize: 20, resetKey: `${resetKey}:lib:${tab}`, onError: err },
  );

  if (list.loading && list.items.length === 0) return <Skeletons />;
  if (list.items.length === 0) {
    return (
      <div className="empty">
        <div className="empty-title">
          {tab === "tracks" ? "No liked songs yet" : "Nothing saved here"}
        </div>
        <div className="empty-sub">
          {tab === "tracks"
            ? "Heart songs in Spotify and they show here."
            : "Save it in Spotify, then refresh."}
        </div>
      </div>
    );
  }
  return (
    <ol className="queue">
      {list.items.map((it, i) =>
        "durationMs" in it ? (
          <TrackRow
            key={`${(it as QueueItem).uri}-${i}`}
            t={it as QueueItem}
            index={i}
            onPlay={() => onPlayUris([(it as QueueItem).uri])}
            onQueue={() => onQueueAdd((it as QueueItem).uri)}
          />
        ) : (
          <Row
            key={`${tab}-${(it as LibraryItem).id}`}
            title={(it as LibraryItem).name}
            sub={(it as LibraryItem).subtitle}
            image={(it as LibraryItem).image}
            onOpen={() => {
              const li = it as LibraryItem;
              if (!li.id) return;
              if (tab === "playlists") onOpen({ kind: "playlist", id: li.id, name: li.name });
              else if (tab === "albums") onOpen({ kind: "album", id: li.id, name: li.name });
              else onOpen({ kind: "artist", id: li.id, name: li.name });
            }}
            onPlay={(it as LibraryItem).uri ? () => onPlayContext((it as LibraryItem).uri) : undefined}
          />
        ),
      )}
      <MoreSentinel list={list} />
    </ol>
  );
}

/** Paged playlist tracks for the detail view. */
function PlaylistTracks({
  id,
  resetKey,
  onPlayUris,
  onQueueAdd,
  onError,
}: {
  id: string;
  resetKey: string;
  onPlayUris: (uris: string[]) => void;
  onQueueAdd: (uri: string) => void;
  onError: (m: string) => void;
}) {
  const err = useCallback((m: string) => onError(scopeHint(m) ?? m), [onError]);
  const list = usePagedList<QueueItem, number>(
    async (limit, cursor) => {
      const off = cursor ?? 0;
      const parsed = parseSavedTracks(await api.playlistTracks(id, limit, off));
      const next = off + parsed.items.length < parsed.total ? off + parsed.items.length : null;
      return { items: parsed.items, next };
    },
    { pageSize: 50, resetKey: `pl-tracks:${resetKey}:${id}`, onError: err },
  );
  if (list.loading && list.items.length === 0) return <Skeletons />;
  return (
    <ol className="queue">
      {list.items.map((t, i) => (
        <TrackRow
          key={`${t.uri}-${i}`}
          t={t}
          index={i}
          onPlay={() => onPlayUris([t.uri])}
          onQueue={() => onQueueAdd(t.uri)}
        />
      ))}
      <MoreSentinel list={list} />
    </ol>
  );
}

export default function BrowsePane(p: Props) {
  const [libTab, setLibTab] = useState<LibTab>("playlists");
  const [userPls, setUserPls] = useState<LibraryItem[]>([]);
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const [me, setMe] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [topArtists, setTopArtists] = useState<LibraryItem[]>([]);
  const [topTracks, setTopTracks] = useState<QueueItem[]>([]);
  const [recent, setRecent] = useState<QueueItem[]>([]);
  const [gen, setGen] = useState(0);
  const searchTimer = useRef<number | null>(null);

  const top = p.state.stack[p.state.stack.length - 1] ?? null;

  const detailGen = useRef(0);
  const fetchDetail = useCallback(
    async (entry: BrowseEntry) => {
      const id = ++detailGen.current;
      const stale = () => id !== detailGen.current;
      setDetailLoading(true);
      setDetail(null);
      setUserPls([]);
      try {
        if (entry.kind === "playlist") {
          const d = parsePlaylistDetail(await api.playlist(entry.id));
          if (stale()) return;
          setDetail(d);
        } else if (entry.kind === "album") {
          const d = parseAlbumDetail(await api.album(entry.id));
          if (stale()) return;
          setDetail(d);
        } else if (entry.kind === "artist") {
          const [a, t] = await Promise.all([api.artist(entry.id), api.artistTop(entry.id)]);
          if (stale()) return;
          setDetail(parseArtistDetail(a, t, null));
        } else {
          const u = await api.user(entry.id);
          if (stale()) return;
          const prof = parseUserProfile(u);
          if (prof) {
            const pls = await api.userPlaylists(entry.id, 10, 0);
            if (stale()) return;
            setUserPls(parsePlaylistPage(pls).items);
          }
          setDetail(null);
        }
      } catch (e) {
        if (stale()) return;
        const m = e instanceof Error ? e.message : String(e);
        p.onError(scopeHint(m) ?? m);
      } finally {
        if (!stale()) setDetailLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (top) void fetchDetail(top);
    if (!top) setDetail(null);
  }, [top?.kind, top && "id" in top ? (top as { id: string }).id : null]); // eslint-disable-line react-hooks/exhaustive-deps

  const searchGen = useRef(0);
  const runSearch = useCallback(async (q: string) => {
    const query = q.trim();
    if (!query) {
      setResults(null);
      return;
    }
    const id = ++searchGen.current;
    setSearching(true);
    try {
      const res = parseSearch(await api.searchRaw(query, 5));
      if (id !== searchGen.current) return;
      setResults(res);
    } catch (e) {
      if (id !== searchGen.current) return;
      const m = e instanceof Error ? e.message : String(e);
      p.onError(scopeHint(m) ?? m);
    } finally {
      if (id === searchGen.current) setSearching(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (p.state.view !== "search") return;
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => void runSearch(p.state.query), 450);
    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
  }, [p.state.query, p.state.view, runSearch]);

  const fetchProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const [meRaw, topA, topT, rec] = await Promise.all([
        api.me(),
        api.top("artists", 5, 0),
        api.top("tracks", 5, 0),
        api.recent(8),
      ]);
      setMe(parseUserProfile(meRaw));
      const ta = topA as Record<string, unknown>;
      setTopArtists(
        Array.isArray(ta["items"])
          ? (ta["items"] as Array<Record<string, unknown>>).map((x) => toLibraryItem(x, "Artist"))
          : [],
      );
      const tt = topT as Record<string, unknown>;
      const tlist = Array.isArray(tt["items"]) ? (tt["items"] as Array<Record<string, unknown>>) : [];
      setTopTracks(
        tlist.map((o) => ({
          name: typeof o["name"] === "string" ? (o["name"] as string) : "Unknown",
          artists: Array.isArray(o["artists"])
            ? (o["artists"] as Array<Record<string, unknown>>)
                .map((a) => (typeof a["name"] === "string" ? (a["name"] as string) : ""))
                .filter(Boolean)
                .join(", ")
            : "",
          durationMs: typeof o["duration_ms"] === "number" ? (o["duration_ms"] as number) : 0,
          uri: typeof o["uri"] === "string" ? (o["uri"] as string) : "",
        })),
      );
      const rc = rec as Record<string, unknown>;
      const rlist = Array.isArray(rc["items"]) ? (rc["items"] as Array<Record<string, unknown>>) : [];
      setRecent(
        rlist
          .map((w) => w["track"] as Record<string, unknown> | undefined)
          .filter((t): t is Record<string, unknown> => !!t && typeof t["uri"] === "string")
          .map((o) => ({
            name: typeof o["name"] === "string" ? (o["name"] as string) : "Unknown",
            artists: Array.isArray(o["artists"])
              ? (o["artists"] as Array<Record<string, unknown>>)
                  .map((a) => (typeof a["name"] === "string" ? (a["name"] as string) : ""))
                  .filter(Boolean)
                  .join(", ")
              : "",
            durationMs: typeof o["duration_ms"] === "number" ? (o["duration_ms"] as number) : 0,
            uri: typeof o["uri"] === "string" ? (o["uri"] as string) : "",
          })),
      );
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      p.onError(scopeHint(m) ?? m);
    } finally {
      setProfileLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (p.state.view === "profile" && !top) void fetchProfile();
  }, [p.state.view, top, fetchProfile]);

  const open = (e: BrowseEntry) => p.onChange({ ...p.state, stack: [...p.state.stack, e] });
  const back = () => p.onChange({ ...p.state, stack: p.state.stack.slice(0, -1) });
  const refresh = () => {
    if (p.state.view === "library") setGen((g) => g + 1);
    else if (p.state.view === "profile") void fetchProfile();
    else void runSearch(p.state.query);
  };

  if (top) {
    const label = top.kind === "profile" ? top.name ?? top.id : top.name ?? top.id;
    return (
      <>
        <div className="pane-subhead">
          <button className="icon-btn sm" onClick={back} title="Back" aria-label="Back">
            ←
          </button>
          <span title={label}>{label}</span>
        </div>
        {detailLoading ? (
          <>
            <div className="skel skel-head" aria-hidden="true" />
            <Skeletons n={4} />
          </>
        ) : detail ? (
          <>
            <div className="detail-head">
              {detail.image && <img src={detail.image} alt="" loading="lazy" />}
              <div>
                <div className="detail-title">{detail.name}</div>
                <div className="dim">
                  {detail.kind === "playlist" && detail.owner}
                  {detail.kind === "album" && detail.artists}
                  {detail.kind === "artist" && detail.genres.join(" · ")}
                </div>
                <button className="btn sm primary" onClick={() => p.onPlayContext(detail.uri)}>
                  Play
                </button>
              </div>
            </div>
            {detail.kind === "playlist" && top.kind === "playlist" ? (
              <PlaylistTracks
                id={top.id}
                resetKey={String(gen)}
                onPlayUris={p.onPlayUris}
                onQueueAdd={p.onQueueAdd}
                onError={p.onError}
              />
            ) : (
              <ol className="queue">
                {(detail.kind === "artist" ? detail.topTracks : detail.tracks).map((t, i) => (
                  <TrackRow
                    key={`${t.uri}-${i}`}
                    t={t}
                    index={i}
                    onPlay={() => p.onPlayUris([t.uri])}
                    onQueue={() => p.onQueueAdd(t.uri)}
                  />
                ))}
              </ol>
            )}
          </>
        ) : top.kind === "profile" ? (
          <>
            <div className="empty">
              <div className="empty-title">{top.name ?? "User"}</div>
              <div className="empty-sub">Public playlists below.</div>
            </div>
            <ol className="queue">
              {userPls.map((it) => (
                <Row
                  key={it.id}
                  title={it.name}
                  sub={it.subtitle}
                  image={it.image}
                  onOpen={() => open({ kind: "playlist", id: it.id, name: it.name })}
                  onPlay={() => p.onPlayContext(it.uri)}
                />
              ))}
            </ol>
          </>
        ) : (
          <div className="empty">
            <div className="empty-title">Nothing here</div>
            <div className="empty-sub">Spotify returned no detail for this item.</div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div className="browse-tabs" role="tablist" aria-label="Browse">
        {(["library", "search", "profile"] as const).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={p.state.view === v}
            className={`chip${p.state.view === v ? " chip-on" : ""}`}
            onClick={() => p.onChange({ ...p.state, view: v, stack: [] })}
          >
            {v[0].toUpperCase() + v.slice(1)}
          </button>
        ))}
        {p.state.view === "library" && (
          <>
            <span className="sep" aria-hidden="true" />
            {(["playlists", "albums", "tracks", "artists"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={libTab === t}
                className={`chip${libTab === t ? " chip-on" : ""}`}
                onClick={() => setLibTab(t)}
                aria-label={`Library: ${t}`}
              >
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </>
        )}
        <button
          className="icon-btn sm"
          title="Refresh"
          aria-label="Refresh browse"
          onClick={refresh}
        >
          <RefreshIcon size={14} />
        </button>
      </div>

      {p.state.view === "library" && (
        <LibraryList
          tab={libTab}
          resetKey={String(gen)}
          onOpen={open}
          onPlayContext={p.onPlayContext}
          onPlayUris={p.onPlayUris}
          onQueueAdd={p.onQueueAdd}
          onError={p.onError}
        />
      )}

      {p.state.view === "search" && (
        <>
          <input
            className="search-input"
            value={p.state.query}
            placeholder="Search songs, artists, playlists…"
            aria-label="Search Spotify"
            onChange={(e) => p.onChange({ ...p.state, query: e.target.value })}
          />
          {searching && !results ? (
            <Skeletons />
          ) : !results ? (
            <div className="empty">
              <div className="empty-title">Search Spotify</div>
              <div className="empty-sub">Results open playlists, artists, and albums.</div>
            </div>
          ) : (
            <>
              {results.tracks.length > 0 && (
                <>
                  <div className="pane-subhead">Songs</div>
                  <ol className="queue">
                    {results.tracks.map((t, i) => (
                      <TrackRow
                        key={`s-t-${t.uri}-${i}`}
                        t={t}
                        onPlay={() => p.onPlayUris([t.uri])}
                        onQueue={() => p.onQueueAdd(t.uri)}
                      />
                    ))}
                  </ol>
                </>
              )}
              {results.artists.length > 0 && (
                <>
                  <div className="pane-subhead">Artists</div>
                  <ol className="queue">
                    {results.artists.map((it) => (
                      <Row
                        key={`s-a-${it.id}`}
                        title={it.name}
                        sub="Artist"
                        image={it.image}
                        onOpen={() => open({ kind: "artist", id: it.id, name: it.name })}
                      />
                    ))}
                  </ol>
                </>
              )}
              {results.playlists.length > 0 && (
                <>
                  <div className="pane-subhead">Playlists</div>
                  <ol className="queue">
                    {results.playlists.map((it) => (
                      <Row
                        key={`s-p-${it.id}`}
                        title={it.name}
                        sub={it.subtitle || "Playlist"}
                        image={it.image}
                        onOpen={() => open({ kind: "playlist", id: it.id, name: it.name })}
                        onPlay={() => p.onPlayContext(it.uri)}
                      />
                    ))}
                  </ol>
                </>
              )}
              {results.albums.length > 0 && (
                <>
                  <div className="pane-subhead">Albums</div>
                  <ol className="queue">
                    {results.albums.map((it) => (
                      <Row
                        key={`s-al-${it.id}`}
                        title={it.name}
                        sub={it.subtitle || "Album"}
                        image={it.image}
                        onOpen={() => open({ kind: "album", id: it.id, name: it.name })}
                        onPlay={() => p.onPlayContext(it.uri)}
                      />
                    ))}
                  </ol>
                </>
              )}
            </>
          )}
        </>
      )}

      {p.state.view === "profile" && (
        <>
          {profileLoading && !me ? (
            <>
              <div className="skel skel-head" aria-hidden="true" />
              <Skeletons n={4} />
            </>
          ) : (
            <>
              {me && (
                <div className="detail-head">
                  {me.image && <img src={me.image} alt="" loading="lazy" />}
                  <div>
                    <div className="detail-title">{me.name}</div>
                    <div className="dim">{me.followers} followers</div>
                  </div>
                </div>
              )}
              {topArtists.length > 0 && (
                <>
                  <div className="pane-subhead">Top artists</div>
                  <ol className="queue">
                    {topArtists.map((it) => (
                      <Row
                        key={`t-a-${it.id}`}
                        title={it.name}
                        sub="Artist"
                        image={it.image}
                        onOpen={() => open({ kind: "artist", id: it.id, name: it.name })}
                      />
                    ))}
                  </ol>
                </>
              )}
              {topTracks.length > 0 && (
                <>
                  <div className="pane-subhead">Top songs</div>
                  <ol className="queue">
                    {topTracks.map((t, i) => (
                      <TrackRow
                        key={`t-t-${t.uri}-${i}`}
                        t={t}
                        onPlay={() => p.onPlayUris([t.uri])}
                        onQueue={() => p.onQueueAdd(t.uri)}
                      />
                    ))}
                  </ol>
                </>
              )}
              {recent.length > 0 && (
                <>
                  <div className="pane-subhead">Recently played</div>
                  <ol className="queue">
                    {recent.map((t, i) => (
                      <TrackRow key={`r-${t.uri}-${i}`} t={t} onQueue={() => p.onQueueAdd(t.uri)} />
                    ))}
                  </ol>
                </>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
