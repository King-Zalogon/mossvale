import {createHash, randomBytes} from 'node:crypto';

const TOKEN_PATTERN = /^mv_mcp_v1_[A-Za-z0-9_-]{43}$/u;

export function createMcpToken() {
  return `mv_mcp_v1_${randomBytes(32).toString('base64url')}`;
}

export function isMcpToken(value) {
  return typeof value === 'string' && TOKEN_PATTERN.test(value);
}

export function hashMcpToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function readMcpBearer(request) {
  const match = /^Bearer (mv_mcp_v1_[A-Za-z0-9_-]{43})$/u.exec(request.headers.get('authorization') ?? '');
  return match?.[1] ?? null;
}
