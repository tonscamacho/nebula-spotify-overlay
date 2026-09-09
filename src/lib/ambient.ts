const cache = new Map<string, string>();
const MAX_ENTRIES = 20;

function store(url: string, color: string): string {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(url, color);
  return color;
}

/**
 * Samples the average color of a cover-art URL through a 24px canvas.
 * Resolves null when the image cannot be decoded or is CORS-tainted.
 * Results are memoized per URL (cap 20) so a track change costs one
 * tiny decode and repeated renders cost nothing.
 */
export function sampleAmbient(url: string | null): Promise<string | null> {
  if (!url) return Promise.resolve(null);
  const hit = cache.get(url);
  if (hit !== undefined) return Promise.resolve(hit === "" ? null : hit);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    const done = (color: string | null) => {
      store(url, color ?? "");
      resolve(color);
    };
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = 24;
        c.height = 24;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          done(null);
          return;
        }
        ctx.drawImage(img, 0, 0, 24, 24);
        const d = ctx.getImageData(0, 0, 24, 24).data;
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let i = 0; i < d.length; i += 16) {
          r += d[i];
          g += d[i + 1];
          b += d[i + 2];
          n += 1;
        }
        r = Math.round(r / n);
        g = Math.round(g / n);
        b = Math.round(b / n);
        done(`rgb(${r}, ${g}, ${b})`);
      } catch {
        done(null);
      }
    };
    img.onerror = () => done(null);
    img.src = url;
  });
}
