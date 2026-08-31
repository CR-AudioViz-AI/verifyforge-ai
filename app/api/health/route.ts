// app/api/health/route.ts
//
// 2026-08-30. Added across the fleet: 133 of 145 apps had NO health endpoint, so
// nothing could tell whether they were alive except a human loading the homepage.
//
// WHAT THIS REPORTS AND WHY IT MATTERS: the checks, not merely that the route ran.
// Three sentinel bots on this platform returned HTTP 200 while writing zero rows,
// and /api/cron/bots served a cached response for hours while reporting 7/7
// success. A health endpoint that answers 200 because it was reachable is the same
// defect wearing a different hat.
//
// So `status` is degraded unless every check actually passed, and each check
// reports its own outcome rather than being collapsed into one boolean.
//
// NO SECRETS ARE RETURNED. Not the key, not its length, not a masked prefix — a
// health endpoint is unauthenticated by design, and "which credentials exist" is
// exactly the map an attacker wants.
//
// Portable on purpose: it reads only NEXT_PUBLIC_ values and process.env, with no
// import from lib/. Core's version imports @/lib/supabase/keys, which does not
// exist in most of these repos — copying it verbatim would have failed 133 builds.
//
// CR AudioViz AI, LLC · EIN 39-3646201

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const checks: Record<string, string> = {};
  const started = Date.now();

  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key =
    process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] ??
    process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];

  if (!url || !key) {
    // "not configured" is a real answer and a different one from "down". An app
    // with no database is not unhealthy; an app that cannot reach the database it
    // was configured for is.
    checks["supabase"] = "not_configured";
  } else {
    try {
      // /auth/v1/health — GoTrue's own liveness endpoint.
      //
      // 2026-08-30, SECOND PASS: the first version did a HEAD against /rest/v1/ and
      // returned error:401 on EVERY app. PostgREST's root requires more than an
      // anon apikey, so a healthy platform reported degraded across 133 apps. I
      // caught it because the answer was identical everywhere, and a check that
      // fails uniformly is measuring itself rather than the thing.
      //
      // This endpoint answers 200 with the apikey alone, needs NO table, and so
      // works in every repo regardless of schema — verified against the live
      // project before shipping this time.
      const r = await fetch(`${url}/auth/v1/health`, {
        headers: { apikey: key },
        // Bounded. A health check that can hang is a health check that will, and
        // an uptime monitor waiting 30 seconds reports an outage that is really a
        // timeout in the probe itself.
        signal: AbortSignal.timeout(3000),
        cache: "no-store",
      });
      checks["supabase"] = r.ok ? "ok" : `error:${r.status}`;
    } catch {
      checks["supabase"] = "timeout";
    }
  }

  const allOk = Object.values(checks).every(
    (v) => v === "ok" || v === "not_configured",
  );

  return NextResponse.json(
    {
      status: allOk ? "healthy" : "degraded",
      ts: new Date().toISOString(),
      latencyMs: Date.now() - started,
      checks,
      // The commit actually serving this request. Without it, "is my fix live?"
      // needs a Vercel dashboard — and thirteen crons once ran against a dead
      // deployment for days because nothing reported which build was answering.
      version: process.env["VERCEL_GIT_COMMIT_SHA"]?.slice(0, 8) ?? "local",
      env: process.env["VERCEL_ENV"] ?? "development",
    },
    {
      // 503 when degraded. An uptime monitor reads the STATUS CODE, not the body —
      // returning 200 with {"status":"degraded"} is precisely the 200-serving-404
      // defect that made six pages on this platform report healthy while broken.
      status: allOk ? 200 : 503,
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}
