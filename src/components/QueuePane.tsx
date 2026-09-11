import type { QueueItem } from "../lib/types";
import { formatMs } from "../lib/lrc";
import { RefreshIcon } from "./icons";

interface Props {
  current: QueueItem | null;
  upcoming: QueueItem[];
  loading: boolean;
  onRefresh: () => void;
}

export default function QueuePane(p: Props) {
  return (
    <>
      <div className="pane-subhead">
        <span>
          Up next
          {p.upcoming.length > 0 && <span className="count"> {p.upcoming.length}</span>}
        </span>
        <button
          className="icon-btn sm"
          onClick={p.onRefresh}
          title="Refresh queue"
          aria-label="Refresh queue"
        >
          <RefreshIcon size={14} />
        </button>
      </div>
      {p.loading && p.upcoming.length === 0 ? (
        <div aria-label="Loading queue" role="status">
          <div className="skel skel-row" />
          <div className="skel skel-row" />
          <div className="skel skel-row" />
        </div>
      ) : p.upcoming.length === 0 ? (
        <div className="empty">
          <div className="empty-title">Queue is empty</div>
          <div className="empty-sub">Spotify builds it as you listen.</div>
        </div>
      ) : (
        <ol className="queue">
          {p.upcoming.map((q, i) => (
            <li className="q" key={`${q.uri}-${i}`} title={q.uri}>
              <span className="q-index">{String(i + 1).padStart(2, "0")}</span>
              <span className="q-name">
                {q.name}
                <small>{q.artists}</small>
              </span>
              <span className="q-time">{formatMs(q.durationMs)}</span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
