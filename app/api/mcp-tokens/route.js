import {ApiError, apiFailure, databaseError, readJson, reply, requireSameOrigin} from '@/lib/account/http';
import {requireOwnerAccount} from '@/lib/account/auth';
import {createMcpToken, hashMcpToken} from '@/lib/mcp/token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    requireSameOrigin(request);
    const body = await readJson(request, 2048);
    const label = typeof body?.label === 'string' ? body.label.trim() : '';
    if (!label || label.length > 40) throw new ApiError(400, 'Give this client a label of 1–40 characters.');

    const {supabase} = await requireOwnerAccount();
    const token = createMcpToken();
    const {data, error} = await supabase.rpc('mossvale_mcp_create_token', {p_token_hash: hashMcpToken(token), p_label: label});
    databaseError(error);
    if (!data?.id || !data?.createdAt) throw new ApiError(503, 'The MCP token could not be created. Please try again.');
    return reply({id: data.id, label: data.label, createdAt: data.createdAt, token});
  } catch (error) {
    return apiFailure(error);
  }
}

export async function DELETE(request) {
  try {
    requireSameOrigin(request);
    const body = await readJson(request, 2048);
    if (typeof body?.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(body.id))
      throw new ApiError(400, 'Choose a valid MCP token to revoke.');

    const {supabase} = await requireOwnerAccount();
    const {data, error} = await supabase.rpc('mossvale_mcp_revoke_token', {p_token_id: body.id});
    databaseError(error);
    if (data !== true) throw new ApiError(404, 'That MCP token is already revoked or unavailable.');
    return reply({ok: true});
  } catch (error) {
    return apiFailure(error);
  }
}
