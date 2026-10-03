import {requireAccount} from '@/lib/account/auth';
import {ApiError, apiFailure, databaseError, reply} from '@/lib/account/http';
import {REVIEW_INSTRUCTIONS} from '@/scripts/lib/feedback-review.mjs';

// Owner-only handoff for any AI conversation. No service-role key is used by the site.
export async function GET() {
  try {
    const {supabase, user} = await requireAccount();
    const {data: profile, error: roleError} = await supabase.from('portal_profiles').select('role').eq('user_id', user.id).maybeSingle();
    databaseError(roleError);
    if (profile?.role !== 'owner') throw new ApiError(403, 'Only the portal owner can review player feedback.');
    const {data, error} = await supabase
      .from('mossvale_feedback')
      .select('id,message,pack_id,map_id,build,created_at')
      .is('reviewed_at', null)
      .order('created_at')
      .limit(50);
    databaseError(error);
    return reply({
      instructions:
        REVIEW_INSTRUCTIONS +
        ' Fetch the current open and closed issues from King-Zalogon/mossvale before making decisions. Return the review JSON for the review worker; do not publish this private handoff.',
      feedback: data,
    });
  } catch (error) {
    return apiFailure(error);
  }
}
