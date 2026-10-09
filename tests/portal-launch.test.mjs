import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

test('private portal launches the game with a trailing slash for relative assets', () => {
  const route = readFileSync(join(root, 'app/api/launch/route.js'), 'utf8');
  assert.match(route, /NextResponse\.json\(\{url:\s*['"]\/game\/['"]\}\)/);
  assert.doesNotMatch(route, /url:\s*['"]\/game\/index\.html['"]/);
});

test('direct game URL redirects to the slash-terminated mount path', () => {
  const config = readFileSync(join(root, 'next.config.mjs'), 'utf8');
  assert.match(config, /source:\s*['"]\/game['"]/);
  assert.match(config, /destination:\s*['"]\/game\/['"]/);
});
