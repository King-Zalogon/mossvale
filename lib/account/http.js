export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const reply = (body, status = 200) => Response.json(body, {status, headers: {'Cache-Control': 'private, no-store'}});

export function requireSameOrigin(request) {
  const target = new URL(request.url);
  // Next/Vercel may use an internal hostname in request.url. Compare with the public request host.
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? target.host;
  const protocol = request.headers.get('x-forwarded-proto') ?? target.protocol.slice(0, -1);
  if (!['http', 'https'].includes(protocol) || /[\s,]/.test(host) || host.includes('/') || request.headers.get('origin') !== `${protocol}://${host}`)
    throw new ApiError(403, 'Open this form from the game site.');
}

export async function readJson(request, maxBytes) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new ApiError(415, 'Send a JSON request.');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'The request is empty.');
  const chunks = [];
  let bytes = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw new ApiError(413, 'That request is too large.');
    }
    chunks.push(value);
  }
  try {
    const merged = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return JSON.parse(new TextDecoder().decode(merged));
  } catch {
    throw new ApiError(400, 'That request is not valid JSON.');
  }
}

export function databaseError(error) {
  if (!error) return;
  const known = {
    sign_in_required: [401, 'Please sign in again.'],
    access_denied: [403, 'Your account does not have Mossvale access.'],
    daily_limit: [429, 'You have sent 10 messages today. Please return tomorrow (UTC).'],
    invalid_feedback: [400, 'Feedback must contain 1–2,000 characters.'],
    request_conflict: [409, 'This submission changed. Reopen the feedback form and try again.'],
    invalid_save: [400, 'That account save is not valid.'],
    save_conflict: [409, 'Another device changed your account save. Reopen this menu and check that save before uploading.'],
    mcp_token_limit: [409, 'Revoke an existing MCP token before creating another.'],
    owner_required: [403, 'Only the portal owner can manage feedback MCP access.'],
    invalid_mcp_token: [400, 'That MCP token request is invalid.'],
  };
  const setupCodes = ['PGRST202', 'PGRST205', '42P01', '42883'];
  if (setupCodes.includes(error.code))
    throw new ApiError(
      503,
      'Account storage has not been set up on this site yet. The site owner needs to finish database setup. Your local progress is safe.',
    );
  const match = Object.entries(known).find(([key]) => error.message?.includes(key));
  throw new ApiError(...(match?.[1] ?? [503, 'Account storage is unavailable. Your local progress and feedback text are unchanged.']));
}

export function apiFailure(error) {
  return reply(
    {error: error instanceof ApiError ? error.message : 'Account services are unavailable. Please try again later.'},
    error instanceof ApiError ? error.status : 503,
  );
}
