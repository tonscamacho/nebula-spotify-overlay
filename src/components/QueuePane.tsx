import type { QueueItem } from "../lib/types";
import { formatMs } from "../lib/lrc";

interface Props {
  current: QueueItem | null;
  upcoming: QueueItem[];
  loading: boolean;
  onRefresh: () => void;
}

export default function QueuePane(p: Props) {
  return (
    <div className="pane-body">
      <div className="pane-subhead">
        <span>Up next</span>
        <button className="chip" onClick={p.onRefresh} title="Refresh queue">
          ⟳
        </button>
      </div>
      {p.loading && p.upcoming.length === 0 ? (
        <div className="empty">
          <div className="empty-title">Loading queue…</div>
        </div>
      ) : p.upcoming.length === 0 ? (
        <div className="empty">
          <div className="empty-title">Queue is empty</div>
          <div className="empty-sub">Spotify builds it as you listen.</div>
        </div>
      ) : (
        <div className="queue">
          {p.upcoming.map((q, i) => (
            <div className="q" key={`${q.uri}-${i}`} title={q.uri}>
              <span className="q-name">
                {q.name} <small>— {q.artists}</small>
              </span>
              <small>{formatMs(q.durationMs)}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
