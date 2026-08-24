'use client';

/**
 * app/auth/callback/page.tsx — the OAuth code exchange, on the client.
 *
 * WHY THIS EXISTS. app/api/auth/callback/route.ts called
 * exchangeCodeForSession() on a client built with plain createClient() and no
 * cookie adapter. The exchanged session landed in a server-side, in-memory
 * client that was discarded when the request ended, and the user was redirected
 * as though signed in. OAuth could not work, and the failure was silent.
 *
 * The exchange happens here instead, on the SAME persisting browser client that
 * holds a password session. One session store, one place a token comes from. The
 * alternative — cookie-based SSR sessions via @supabase/ssr — would give the app
 * two stores that can disagree about who is signed in.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-24
 */

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase';
import { clearLegacySession } from '@/lib/auth/session';

export default function AuthCallbackPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const complete = async (): Promise<void> => {
      const code = params.get('code');
      const redirectTo = params.get('redirect_to') ?? '/dashboard';

      // The provider reports its own failures here. Surface them rather than
      // redirecting to a dashboard that will bounce the user straight back.
      const providerError = params.get('error_description') ?? params.get('error');
      if (providerError !== null) {
        if (!cancelled) setError(providerError);
        return;
      }

      if (code === null) {
        if (!cancelled) setError('This sign-in link is missing its code. Start again from the sign-in page.');
        return;
      }

      clearLegacySession();

      const { error: exchangeError } = await createSupabaseBrowserClient().auth.exchangeCodeForSession(code);
      if (cancelled) return;

      if (exchangeError !== null) {
        setError(exchangeError.message);
        return;
      }
      router.replace(redirectTo);
    };

    void complete();
    return () => { cancelled = true; };
  }, [params, router]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#0a0a0f' }}>
      <div className="max-w-md w-full text-center">
        {error === null ? (
          <>
            <div className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-4"
                 style={{ borderColor: 'var(--brand-cyan-400)', borderTopColor: 'transparent' }} />
            <p style={{ color: 'var(--brand-slate-400)', fontSize: 14 }}>Completing sign-in…</p>
          </>
        ) : (
          <div role="alert" className="rounded-lg border p-4"
               style={{ borderColor: 'rgba(248,113,113,0.4)', background: 'rgba(248,113,113,0.12)' }}>
            <p style={{ color: '#fca5a5', fontSize: 14, marginBottom: 12 }}>Sign-in could not be completed: {error}</p>
            <a href="/auth" style={{ color: 'var(--brand-cyan-400)', fontSize: 14, textDecoration: 'none' }}>
              Back to sign in
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
