import {requireAccount} from '@/lib/account/auth';
import {ApiError, apiFailure, databaseError, readJson, reply, requireSameOrigin} from '@/lib/account/http';
import {saveInput, validId} from '@/lib/account/validation';

export async function GET(request) {
  try {
    const {supabase, user} = await requireAccount();
    const pack = new URL(request.url).searchParams.get('pack');
    if (!validId(pack)) throw new ApiError(400, 'Choose a valid adventure.');
    const {data, error} = await supabase
      .from('mossvale_account_saves')
      .select('backup,revision,updated_at')
      .eq('user_id', user.id)
      .eq('pack_id', pack)
      .maybeSingle();
    databaseError(error);
    return reply({
      accountId: user.id,
      account: user.email ?? 'Signed-in account',
      backup: data?.backup ?? null,
      revision: data?.revision ?? 0,
      updatedAt: data?.updated_at ?? null,
    });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request) {
  try {
    requireSameOrigin(request);
    const {supabase, user} = await requireAccount();
    const body = await readJson(request, 1100000);
    if (body?.accountId !== user.id) throw new ApiError(401, 'The signed-in account changed. Reopen this menu before sending.');
    const input = saveInput(body);
    const {data, error} = await supabase.rpc('mossvale_store_save', input);
    databaseError(error);
    return reply(data);
  } catch (error) {
    return apiFailure(error);
  }
}
