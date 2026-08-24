// app/api/auth/callback/route.ts — hand the OAuth code to the client.
//
// This route used to call exchangeCodeForSession() itself, on a client built
// with plain createClient() and no cookie adapter. The session it produced lived
// in an in-memory server-side client that was discarded when the request ended,
// and the caller was redirected as though signed in. OAuth never worked and
// nothing reported that it had not.
//
// The exchange now happens on the persisting browser client at
// /auth/callback, so there is one session store rather than two. This route
// survives only so that any redirect URL already configured with the provider
// keeps working: it forwards the query string and does nothing else.
//
// CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-24

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestUrl = new URL(request.url);
  const target = new URL('/auth/callback', requestUrl.origin);
  requestUrl.searchParams.forEach((value, key) => target.searchParams.set(key, value));
  return NextResponse.redirect(target);
}
