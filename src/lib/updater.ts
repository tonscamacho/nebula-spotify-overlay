/** Update flow state. The pending plugin `Update` object itself lives in
 *  an App ref; this is the renderable subset the Settings row reads. */
export type UpdateStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "current" }
  | { kind: "available"; version: string; body: string | null }
  | { kind: "downloading"; version: string; progress: number }
  | { kind: "ready"; version: string }
  | { kind: "error"; message: string };

export function updateError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/404|not found/i.test(m)) {
    return "No published releases found yet. Publish one and try again.";
  }
  return m.length > 160 ? `${m.slice(0, 160)}…` : m;
}
