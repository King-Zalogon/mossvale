import {NextResponse} from 'next/server';
import {apiFailure, requireSameOrigin} from '@/lib/account/http';

export async function POST(request) {
  try {
    requireSameOrigin(request);
  } catch (error) {
    return apiFailure(error);
  }
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
