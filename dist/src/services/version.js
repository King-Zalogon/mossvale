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
  if (!/^[a-f0-9]{7,40}$/i.test(info?.short ?? '')) return 'development build';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(info.builtAt ?? '').slice(0, 10)) ? ` · ${String(info.builtAt).slice(0, 10)}` : '';
  return `Build #${info.short}${info.dirty ? '+' : ''}${date}`;
}
