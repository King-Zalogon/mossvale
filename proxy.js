import {NextResponse} from 'next/server';
import {createServerClient} from '@supabase/ssr';
import {verifyGateTicket} from './lib/gate-ticket.js';

async function refreshSupabaseSession(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next({request});

  let response = NextResponse.next({request});
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const {name, value} of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({request});
        for (const {name, value, options} of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

export async function proxy(request) {
  if (request.nextUrl.pathname === '/game' || request.nextUrl.pathname.startsWith('/game/')) {
    const secret = process.env.MOSSVALE_GATE_SECRET;
    const ticket = request.cookies.get('mossvale_gate')?.value;
    if (!secret || !(await verifyGateTicket(secret, ticket))) {
      return NextResponse.redirect(new URL('/?reason=access', request.url));
    }

    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    return response;
  }

  return refreshSupabaseSession(request);
}

export const config = {
  matcher: ['/', '/api/launch', '/game', '/game/:path*'],
};
