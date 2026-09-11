import { useCallback, useEffect, useRef, useState } from "react";

export interface Page<T, C> {
  items: T[];
  /** Cursor for the next page, or null when exhausted. */
  next: C | null;
}

/** Cursor-generic infinite list. Offset paging adapts as
 *  cursor=number; keyset paging (followed artists) as cursor=string.
 *  One IntersectionObserver sentinel per list; renders only fire on
 *  threshold crossings and page arrivals, never per scroll pixel. */
export function usePagedList<T, C>(
  fetcher: (limit: number, cursor: C | null) => Promise<Page<T, C>>,
  opts: { pageSize?: number; resetKey: string; onError?: (m: string) => void },
) {
  const pageSize = opts.pageSize ?? 20;
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const cursorRef = useRef<C | null>(null);
  const loadingRef = useRef(false);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const errorRef = useRef(opts.onError);
  errorRef.current = opts.onError;

  const loadMore = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const page = await fetcherRef.current(pageSize, cursorRef.current);
      cursorRef.current = page.next;
      setItems((prev) => [...prev, ...page.items]);
      setHasMore(page.next !== null);
    } catch (e) {
      errorRef.current?.(e instanceof Error ? e.message : String(e));
      setHasMore(false);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [pageSize]);

  useEffect(() => {
    cursorRef.current = null;
    setItems([]);
    setHasMore(true);
    void loadMore();
  }, [opts.resetKey, loadMore]);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const setSentinel = useCallback(
    (el: HTMLDivElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      sentinelRef.current = el;
      if (!el) return;
      const root = el.closest(".pane-body");
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((en) => en.isIntersecting)) void loadMore();
        },
        { root, rootMargin: "320px" },
      );
      io.observe(el);
      observerRef.current = io;
    },
    [loadMore],
  );

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return { items, loading, hasMore, sentinelRef: setSentinel };
}
