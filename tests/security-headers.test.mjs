import test from 'node:test';
import assert from 'node:assert/strict';
import nextConfig, {GAME_CSP} from '../next.config.mjs';

const rules = await nextConfig.headers();
const find = (source, key) => rules.find(rule => rule.source === source).headers.find(header => header.key === key)?.value;

test('every route denies framing and sniffing; HSTS and a permissions policy are set', () => {
  assert.equal(find('/:path*', 'X-Frame-Options'), 'DENY');
  assert.equal(find('/:path*', 'X-Content-Type-Options'), 'nosniff');
  assert.match(find('/:path*', 'Content-Security-Policy'), /frame-ancestors 'none'/);
  assert.match(find('/:path*', 'Strict-Transport-Security'), /max-age=\d{8,}/);
  assert.match(find('/:path*', 'Permissions-Policy'), /camera=\(\)/);
  assert.equal(nextConfig.poweredByHeader, false);
});

test('the private game is no-store and has a strict, same-origin CSP', () => {
  assert.equal(find('/game/:path*', 'Cache-Control'), 'private, no-store, max-age=0');
  assert.equal(find('/game/:path*', 'Content-Security-Policy'), GAME_CSP);
  for (const directive of ["default-src 'self'", "script-src 'self'", "object-src 'none'", "frame-ancestors 'none'", "connect-src 'self'"])
    assert.ok(GAME_CSP.includes(directive), directive);
  assert.equal(/unsafe-eval|script-src[^;]*unsafe-inline/.test(GAME_CSP), false, 'no eval or inline script');
  const hosts = [...GAME_CSP.matchAll(/https?:\/\/[^\s;]+/g)].map(match => match[0]).sort();
  assert.deepEqual(hosts, ['https://fonts.gstatic.com', 'https://fonts.googleapis.com'].sort(), 'only Google Fonts is allowed off-origin');
});
