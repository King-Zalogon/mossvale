import {NextResponse} from 'next/server';
import {createGateTicket} from '@/lib/gate-ticket';
import {createSupabaseServerClient} from '@/lib/supabase/server';

export async function POST() {
  const secret = process.env.MOSSVALE_GATE_SECRET;
  if (!secret || secret.length < 32) {
    return NextResponse.json({error: 'The private game gate is not configured yet.'}, {status: 503});
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: {user},
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({error: 'Please sign in again.'}, {status: 401});

  const {data: app, error} = await supabase.from('applications').select('id').eq('slug', 'mossvale').eq('is_enabled', true).maybeSingle();
  if (error || !app) return NextResponse.json({error: 'Your account does not have access to Mossvale.'}, {status: 403});

  // Open the static entry file so Next's default `/game` canonical route
  // cannot loop with a custom trailing-slash redirect. Its relative assets
  // still resolve under `/game/` from this URL.
  const response = NextResponse.json({url: '/game/index.html'});
  response.cookies.set('mossvale_gate', await createGateTicket(secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/game',
    maxAge: 10 * 60,
  });
  return response;
}
