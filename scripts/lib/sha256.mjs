import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {extname} from 'node:path';

const TEXT_EXTENSIONS = new Set(['.css', '.html', '.js', '.json', '.md', '.mjs', '.py', '.txt']);

/** Hash text evidence identically on LF and CRLF checkouts while preserving exact hashes for binary assets. */
export function sha256File(path) {
  const raw = readFileSync(path);
  const stable = TEXT_EXTENSIONS.has(extname(path).toLowerCase()) ? Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n')) : raw;
  return createHash('sha256').update(stable).digest('hex');
}
