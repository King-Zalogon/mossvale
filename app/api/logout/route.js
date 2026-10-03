import {NextResponse} from 'next/server';

export async function POST() {
  const response = NextResponse.json({ok: true});
  response.cookies.set('mossvale_gate', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/game',
    maxAge: 0,
  });
  return response;
}
