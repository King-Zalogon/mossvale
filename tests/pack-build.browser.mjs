// Build and boot two independently selected adventures from the same engine checkout.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve, extname} from 'node:path';
import http from 'node:http';
import {chromium} from 'playwright';

const root = resolve('.');
const scratch = mkdtempSync(join(tmpdir(), 'mossvale-pack-build-'));
const outputs = new Map();
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml'};
for (const [pack, expected] of [
  ['hearth', 'Hearth Hamlet'],
  ['bakery', 'Bakery Lane'],
]) {
  const output = join(scratch, pack);
  const source = join(root, 'tests/fixtures/packs', pack);
  const result = spawnSync(process.execPath, ['scripts/build.mjs', '--pack', source], {cwd: root, env: {...process.env, BUILD_DIR: output}, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  outputs.set(pack, {output, expected});
}
const server = http.createServer((request, response) => {
  const [pack, ...parts] = new URL(request.url, 'http://localhost').pathname.split('/').filter(Boolean);
  const entry = outputs.get(pack);
  const path = join(entry?.output ?? scratch, ...(parts.length ? parts : ['index.html']));
  if (!entry || !existsSync(path)) return response.writeHead(404).end();
  response.writeHead(200, {'content-type': types[extname(path)] ?? 'application/octet-stream'}).end(readFileSync(path));
});
server.listen(0);
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
try {
  for (const pack of outputs.keys()) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://localhost:${server.address().port}/${pack}/?debug`);
    await page.waitForFunction(() => window.mossvale);
    await page.waitForSelector('#loading', {state: 'hidden'});
    assert.equal(await page.locator('#region-name').textContent(), outputs.get(pack).expected);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('ok standalone selected-pack builds boot independently');
} finally {
  await browser.close();
  server.close();
  rmSync(scratch, {recursive: true, force: true});
}
