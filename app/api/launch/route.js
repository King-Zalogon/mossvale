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

  // Keep the trailing slash so relative assets resolve below the mounted
  // `/game/` path. Without it, `/game` makes the browser request `/style.css`
  // and `/src/main.js` from the portal root, leaving the game unstyled.
  const response = NextResponse.json({url: '/game/'});
  response.cookies.set('mossvale_gate', await createGateTicket(secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/game',
    maxAge: 10 * 60,
  });
  return response;
}
