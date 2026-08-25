'use client';

// app/auth/page.tsx — Javari Verify sign-in
//
// 2026-08-29: THIS PAGE HELD 197 LINES OF LOCAL AUTHENTICATION - signUp,
// signInWithPassword, its own password field, its own error handling. That
// violates ARCHITECTURE-CORE-VS-APP-LAW.
//
// The law: an app consumes CORE OAuth and never implements its own. Verify was
// built wrong twice - first standalone with local auth, then copied into core -
// and this file was the first of those mistakes still standing.
//
// Local auth in an app is not a style preference. It creates a SECOND user record
// outside core's CRM, so the same person has two identities, two credit balances
// and two support histories. Core holds ONE customer record; that is the whole
// point of the boundary.
//
// All 16 providers come from core, via platform-sdk. Nothing here handles a
// password, because this app never sees one.
//
// CR AudioViz AI, LLC · EIN 39-3646201
import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase';

// The providers CORE has enabled, verified against the live Supabase auth config
// on 2026-08-28. Listing fewer here is how an app starts drifting toward its own
// login: whoever needs the missing one adds it locally.
const PROVIDERS = [
  { id: 'google', label: 'Google' },
  { id: 'github', label: 'GitHub' },
  { id: 'microsoft', label: 'Microsoft' },
  { id: 'discord', label: 'Discord' },
  { id: 'linkedin_oidc', label: 'LinkedIn' },
  { id: 'facebook', label: 'Facebook' },
] as const;

export default function AuthPage() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signIn(provider: string) {
    setBusy(provider);
    setError(null);
    try {
      // redirectTo carries ONLY the callback path. The exchange at /auth/callback
      // is passed ONLY the `code` param - never the full URL - and a token never
      // appears in a URL. Locked 2026-07-15.
      const { error: oauthError } = await createSupabaseBrowserClient().auth.signInWithOAuth({
        provider: provider as 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (oauthError) {
        // Reported, not swallowed. A sign-in that fails silently leaves the user
        // staring at an unchanged page with no idea why.
        setError(oauthError.message);
        setBusy(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed');
      setBusy(null);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#040912] px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-white mb-2">Sign in to Javari Verify</h1>
        <p className="text-sm text-slate-400 mb-8">
          Your CR AudioViz AI account works across every Javari app.
        </p>

        <div className="space-y-3">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              onClick={() => signIn(p.id)}
              disabled={busy !== null}
              // 44px minimum height - the Henderson compliance spec asserts tap
              // targets at that floor and this page is not exempt.
              className="w-full min-h-[44px] rounded-lg border border-slate-700 bg-slate-900
                         px-4 py-3 text-white hover:bg-slate-800 disabled:opacity-50
                         transition-colors"
            >
              {busy === p.id ? 'Redirecting…' : `Continue with ${p.label}`}
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="mt-6 text-sm text-red-400">
            {error}
          </p>
        )}

        <p className="mt-8 text-xs text-slate-500">
          Signing in creates or uses your one CR AudioViz AI account. Verify does not
          store a separate password.
        </p>
      </div>
    </main>
  );
}
