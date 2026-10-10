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
