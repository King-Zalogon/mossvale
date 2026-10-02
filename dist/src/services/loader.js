/* Image loading with timeouts, progress and a missing-asset report. No DOM lookups. */
export const TIMEOUT_MS = 20000;

export function loadImage(src, attempt = 0, timeoutMs = TIMEOUT_MS) {
  return new Promise(resolve => {
    const image = new Image();
    let done = false;
    const finish = ok => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(ok ? image : null);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    image.onload = () => finish(image.naturalWidth > 0 && image.naturalHeight > 0);
    image.onerror = () => finish(false);
    image.src = src + (attempt ? '?retry=' + attempt : '');
  });
}

/** Loads every manifest entry into `sprites[index]`; returns the required entries that failed. */
export async function loadAssets({manifest, sprites, attempt, onProgress, timeoutMs = TIMEOUT_MS}) {
  let count = 0;
  const missing = [];
  onProgress(0, manifest.length);
  await Promise.all(
    manifest.map(async (asset, i) => {
      const cached = sprites[i];
      const image = cached && cached.complete && cached.naturalWidth ? cached : await loadImage(asset.src, attempt, timeoutMs);
      if (image) sprites[i] = image;
      else if (asset.required) missing.push(asset);
      onProgress(++count, manifest.length);
    }),
  );
  return missing;
}
