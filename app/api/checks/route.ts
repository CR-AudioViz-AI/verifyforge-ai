/**
 * app/api/checks/route.ts
 *
 * GET /api/checks — the catalog, built from the live registry.
 *
 * 2026-09-02. The list is DERIVED, never written down. A hand-maintained copy of
 * the catalog would drift from the registry the way every other hand-maintained
 * list on this platform drifted: HYDRATE_KEYS named 39 of 181 vault secrets, the
 * backup job covered 36 of 378 tables, the ecosystem monitor watched 9 of 104
 * domains.
 *
 * The failure mode here is specific and bad: a UI listing a check that is not
 * registered lets someone select it, run a scan, and receive a clean result for
 * a check that never executed.
 *
 * Public and cacheable. Someone deciding whether to sign up should be able to
 * read exactly what this product tests, and what each check admits it misses,
 * without an account.
 */

import { NextResponse } from 'next/server';
import { buildRegistry } from '@/lib/registry-instance';
import { CHECK_META, GROUPS, PRESETS, metaFor } from '@/lib/modules/catalog-meta';

export const dynamic = 'force-static';
export const revalidate = 3600;

export async function GET(): Promise<NextResponse> {
  const registry = buildRegistry();
  const modules = [...registry.asMap().values()];

  const checks = modules.map((m) => {
    const meta = metaFor(m.id);
    return {
      id: m.id,
      title: m.title,
      category: m.category,
      whatItChecks: m.whatItChecks,
      // Always sent. A check that will not say what it misses is asking to be
      // taken on faith, and the contract already refuses to register one that
      // declares no blind spots.
      whatItCannotCatch: m.whatItCannotCatch,
      supportedTargetKinds: m.supportedTargetKinds,
      minimumAccessTier: m.minimumAccessTier,
      intrusive: m.intrusive,
      requiresBrowser: m.requiresBrowser,
      requiresAuthenticatedSession: m.requiresAuthenticatedSession,
      estimatedCredits: m.estimatedCredits,
      estimatedRuntimeMs: m.estimatedRuntimeMs,
      inputs: m.inputs,
      groupId: meta?.groupId ?? null,
      defaultOn: meta?.defaultOn ?? true,
      signal: meta?.signal ?? null,
      whyItMatters: meta?.whyItMatters ?? null,
      evidence: meta?.evidence ?? null,
    };
  });

  const registered = new Set(modules.map((m) => m.id));

  return NextResponse.json({
    checks,
    groups: GROUPS,
    // Presets are resolved against the registry rather than returned verbatim.
    // A preset naming a renamed module would otherwise select fewer checks than
    // its label promises, silently.
    presets: PRESETS.map((p) => ({
      ...p,
      moduleIds: p.moduleIds.length === 0 ? [...registered] : p.moduleIds.filter((id) => registered.has(id)),
    })),
    counts: {
      registered: modules.length,
      described: CHECK_META.filter((m) => registered.has(m.moduleId)).length,
      defaultOn: modules.filter((m) => metaFor(m.id)?.defaultOn ?? true).length,
    },
  });
}
