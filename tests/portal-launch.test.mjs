import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

test('private portal launches the static game entry without a redirect loop', () => {
  const route = readFileSync(join(root, 'app/api/launch/route.js'), 'utf8');
  assert.match(route, /NextResponse\.json\(\{url:\s*['"]\/game\/index\.html['"]\}\)/);
  const config = readFileSync(join(root, 'next.config.mjs'), 'utf8');
  assert.doesNotMatch(config, /destination:\s*['"]\/game\/['"]/);
});

test('the game refreshes its private gate before retrying expired asset requests', () => {
  const main = readFileSync(join(root, 'dist/src/main.js'), 'utf8');
  const loader = readFileSync(join(root, 'dist/src/services/loader.js'), 'utf8');
  assert.match(main, /fetch\('\/api\/launch',\s*\{method: 'POST', credentials: 'same-origin'\}\)/);
  assert.match(main, /refreshMissingAssets\(\{missing, sprites, manifest: assets/);
  assert.match(loader, /Retry required resources once after the portal refreshes/);
});
