// Build-time check: every manifest asset exists, is a PNG of the declared size, and no sprite file is unlisted.
import {readFileSync, readdirSync} from 'node:fs';
import {assets} from '../dist/src/data/assets.js';
const dist = new URL('../dist/', import.meta.url);
const manifest = assets,
  errors = [];
for (const a of manifest) {
  let buf;
  try {
    buf = readFileSync(new URL(a.src, dist));
  } catch {
    errors.push(`${a.src}: missing`);
    continue;
  }
  if (buf.toString('latin1', 1, 4) !== 'PNG') {
    errors.push(`${a.src}: not a PNG`);
    continue;
  }
  const w = buf.readUInt32BE(16),
    h = buf.readUInt32BE(20);
  if (w !== a.w || h !== a.h) errors.push(`${a.src}: is ${w}x${h}, manifest says ${a.w}x${a.h}`);
}
const listed = new Set(manifest.map(a => a.src));
for (const f of readdirSync(dist)) if (/^sprite\d+\.png$/.test(f) && !listed.has(f)) errors.push(`${f}: not in manifest`);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`${manifest.length} assets OK`);
