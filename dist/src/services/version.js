/* Optional build stamp written by scripts/build.mjs (version.json). Absent in a plain checkout: that is fine. */
export async function fetchBuild(url = 'version.json') {
  try {
    const response = await fetch(url, {cache: 'no-store'});
    if (!response.ok) return null;
    const info = await response.json();
    return typeof info?.short === 'string' ? info : null;
  } catch {
    return null;
  }
}

export function describeBuild(info) {
  if (!info) return 'development build';
  return `build ${info.short}${info.dirty ? '+' : ''} · ${String(info.builtAt).slice(0, 10)}`;
}
