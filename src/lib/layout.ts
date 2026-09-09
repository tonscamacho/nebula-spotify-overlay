import type { LayoutState, PaneState, PaneType } from "./types";

const KEY = "nebula-layout-v1";
export const SNAP_EDGE = 8;
export const SNAP_ZONE = 16;

function pane(id: string, type: PaneType, x: number, y: number, w: number, h: number, z: number): PaneState {
  return { id, type, x, y, w, h, visible: true, z };
}

export const PRESETS: Record<string, () => LayoutState> = {
  minimal: () => ({
    version: 1,
    preset: "minimal",
    panes: [pane("player", "player", 24, 24, 340, 196, 1)],
  }),
  full: () => ({
    version: 1,
    preset: "full",
    panes: [
      pane("player", "player", 24, 24, 340, 236, 1),
      pane("queue", "queue", 376, 24, 300, 236, 2),
    ],
  }),
  lyrics: () => ({
    version: 1,
    preset: "lyrics",
    panes: [
      pane("lyrics", "lyrics", 24, 24, 420, 380, 1),
      pane("player", "player", 24, 416, 420, 150, 2),
    ],
  }),
};

export function defaultLayout(): LayoutState {
  return PRESETS.full();
}

export function loadLayout(): LayoutState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultLayout();
    const parsed = JSON.parse(raw) as LayoutState;
    if (parsed.version !== 1 || !Array.isArray(parsed.panes) || parsed.panes.length === 0) {
      return defaultLayout();
    }
    return parsed;
  } catch {
    return defaultLayout();
  }
}

export function saveLayout(layout: LayoutState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout));
  } catch {
    // Storage full or blocked. Layout stays in memory.
  }
}

function snapOne(value: number, targets: number[], threshold: number): number {
  for (const t of targets) {
    if (Math.abs(value - t) <= threshold) return t;
  }
  return value;
}

/**
 * Magnet snap for a dragged pane. Snaps x/y to window edges and the
 * edges of sibling panes. Hold Shift to bypass (handled by the caller).
 */
export function snapPane(
  moving: PaneState,
  siblings: PaneState[],
  areaW: number,
  areaH: number,
): { x: number; y: number; snapped: boolean } {
  const xs = [0, Math.max(0, areaW - moving.w)];
  const ys = [0, Math.max(0, areaH - moving.h)];
  for (const s of siblings) {
    if (!s.visible || s.id === moving.id) continue;
    xs.push(s.x, s.x + s.w, s.x - moving.w, s.x + s.w - moving.w);
    ys.push(s.y, s.y + s.h, s.y - moving.h, s.y + s.h - moving.h);
  }
  const x = snapOne(Math.round(moving.x), xs, SNAP_EDGE);
  const zoneTargets = [Math.round(areaW / 2 - moving.w / 2), Math.round(areaW / 3 - moving.w / 2)];
  const x2 = x === moving.x ? snapOne(Math.round(moving.x), zoneTargets, SNAP_ZONE) : x;
  const y = snapOne(Math.round(moving.y), ys, SNAP_EDGE);
  return { x: Math.max(0, x2), y: Math.max(0, y), snapped: x2 !== moving.x || y !== moving.y };
}
