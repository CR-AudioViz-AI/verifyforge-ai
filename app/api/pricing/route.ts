/**
 * app/api/pricing/route.ts
 *
 * Prices, read from the database rather than written into the page.
 *
 * WHY THIS IS AN ENDPOINT AND NOT A CONSTANT. The tiers and credit_packs tables
 * are the source of truth for what a customer is charged. A price typed into a
 * React component is a second source of truth that agrees with the first exactly
 * until somebody changes one of them — and the failure mode is a page quoting
 * $9.99 while the checkout charges $12, which is the kind of thing that ends in a
 * chargeback rather than a bug report.
 *
 * Cached for an hour. Prices change rarely, and a page that cannot render because
 * the database is briefly unreachable is worse than one showing an hour-old price.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-09-04
 */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/api/central';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

interface Tier {
  readonly id: string;
  readonly name: string;
  readonly price_monthly_usd: number;
  readonly price_annual_usd: number | null;
  readonly monthly_credits: number;
  readonly seat_limit: number;
  readonly signup_bonus: number | null;
  readonly sort: number | null;
}

interface Pack {
  readonly name: string;
  readonly credits: number;
  readonly price_cents: number;
}

export async function GET(): Promise<NextResponse> {
  try {
    const sb = createServiceClient();

    const { data: tiers } = await sb
      .from('tiers')
      .select('id,name,price_monthly_usd,price_annual_usd,monthly_credits,seat_limit,signup_bonus,sort')
      .eq('is_active', true)
      .order('sort', { ascending: true })
      .returns<Tier[]>();

    const { data: packs } = await sb
      .from('credit_packs')
      .select('name,credits,price_cents')
      .eq('is_active', true)
      .order('credits', { ascending: true })
      .returns<Pack[]>();

    return NextResponse.json({
      tiers: tiers ?? [],
      packs: (packs ?? []).map((p) => ({
        ...p,
        // Value per credit, so a customer can see which pack is actually better
        // rather than having to divide. A pack priced above the plan rate is a
        // deliberate policy, and hiding the arithmetic would make it look like
        // an accident.
        centsPerCredit: p.credits > 0 ? Number((p.price_cents / p.credits).toFixed(3)) : null,
      })),
      creditFloorUsd: 0.01,
      source: 'tiers and credit_packs tables',
    });
  } catch {
    // Never invent a price. A page with no prices is recoverable; a page with
    // wrong prices is a billing dispute.
    return NextResponse.json(
      {
        tiers: [],
        packs: [],
        error: 'Prices could not be read. Nothing is shown rather than showing a figure that might be wrong.',
      },
      { status: 503 },
    );
  }
}
