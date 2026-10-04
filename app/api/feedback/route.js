import {requireAccount} from '@/lib/account/auth';
import {ApiError, apiFailure, databaseError, readJson, reply, requireSameOrigin} from '@/lib/account/http';
import {feedbackInput} from '@/lib/account/validation';

export async function GET() {
  try {
    const {supabase, user} = await requireAccount();
    const {data, error} = await supabase.rpc('mossvale_feedback_status');
    databaseError(error);
    const {data: profile} = await supabase.from('portal_profiles').select('role').eq('user_id', user.id).maybeSingle();
    return reply({...data, canReview: profile?.role === 'owner', accountId: user.id, account: user.email ?? 'Signed-in account'});
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request) {
  try {
    requireSameOrigin(request);
    const {supabase, user} = await requireAccount();
    const body = await readJson(request, 16000);
    if (body?.accountId !== user.id) throw new ApiError(401, 'The signed-in account changed. Reopen this menu before sending.');
    const input = feedbackInput(body);
    const {data, error} = await supabase.rpc('mossvale_submit_feedback', input);
    databaseError(error);
    return reply(data, 201);
  } catch (error) {
    return apiFailure(error);
  }
}
