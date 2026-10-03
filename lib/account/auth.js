import {createSupabaseServerClient} from '../supabase/server.js';
import {ApiError} from './http.js';

export async function requireAccount() {
  const supabase = await createSupabaseServerClient();
  const {data, error} = await supabase.auth.getUser();
  if (error || !data?.user) throw new ApiError(401, 'Please sign in to your Zalonline account on this site.');
  const {data: app, error: accessError} = await supabase.from('applications').select('id').eq('slug', 'mossvale').eq('is_enabled', true).maybeSingle();
  if (accessError) throw new ApiError(503, 'Account access could not be checked. Please try again.');
  if (!app) throw new ApiError(403, 'Your account does not have Mossvale access.');
  return {supabase, user: data.user};
}
