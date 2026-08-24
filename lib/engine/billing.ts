// lib/engine/billing.ts — what VerifyForge charges, and why each price holds
//
// Roy: a money maker. The engine is only half of that; the other half is
// knowing who is stuck, why, and whether charging them is fair.
//
// THE ONE RULE THAT GOVERNS EVERY PRICE HERE:
//
//   Charge the party whose PROBLEM it is.
//
//   A player stuck in a game is the product working. Charge the player.
//   A user stuck in a tool is the product failing. Charge the BUILDER, and give
//   the user the answer free — charging them is charging for our own mistake,
//   and it is the fastest way to be resented.
//
// That single distinction is what stops this becoming a tollbooth on other
// people's design failures, which is a business that works for about a year.
//
// CR AudioViz AI, LLC · EIN 39-3646201 · August 2026

import type { ArtifactKind } from '../manifest/artifact'

export type Payer = 'player' | 'builder' | 'integrator'

export interface Product {
  sku: string
  name: string
  payer: Payer
  /** Credits at the platform rate of 1 credit = $0.01. */
  credits: number
  recurring?: 'monthly'
  what: string
  /** Why this price is defensible, in the buyer's terms. */
  why: string
}

/** 1 credit = $0.01, per the platform pricing law. */
export const CREDIT_USD = 0.01
export const usd = (credits: number): string => `$${(credits * CREDIT_USD).toFixed(2)}`

export const CATALOGUE: Product[] = [
  // ── Player-facing. Only ever for games. ──────────────────────────────────
  { sku: 'hint.nudge', name: 'Nudge', payer: 'player', credits: 0,
    what: 'A direction, not an answer.',
    why: 'Always free. A player who only needed pointing should never pay, and the goodwill converts better than the two credits would have.' },
  { sku: 'hint.push', name: 'Push', payer: 'player', credits: 200,
    what: 'Narrows it to a place without naming the action.',
    why: 'The tier most players actually want. Cheap enough to buy on impulse while still playing.' },
  { sku: 'hint.answer', name: 'Answer', payer: 'player', credits: 500,
    what: 'The exact steps.',
    why: 'Priced above the push deliberately. A player who buys these for everything did not enjoy the game, and we would rather they bought fewer.' },
  { sku: 'hint.guide', name: 'Full guide', payer: 'player', credits: 1200,
    what: 'Every answer for one artifact, discounted.',
    why: 'For completionists, who are a real and underserved audience. Cheaper than four answers.' },

  // ── Builder-facing. Everything that is not a game. ───────────────────────
  { sku: 'audit.single', name: 'Full audit', payer: 'builder', credits: 2900,
    what: 'Crawl, guided solve, unguided solve, every capability and claim checked, every finding with a fix.',
    why: 'One run costs less than an hour of the builder\'s time and finds what an hour of their time would not. The exposure checks alone have found live migration endpoints publishing their own secrets.' },
  { sku: 'audit.watch', name: 'Continuous watch', payer: 'builder', credits: 1900, recurring: 'monthly',
    what: 'Re-runs on every deploy. Alerts on any regression against the last passing run.',
    why: 'The value is not the test, it is finding out before a customer does. Priced monthly because that is when the risk recurs.' },
  { sku: 'badge.verified', name: 'Verified badge and public results', payer: 'builder', credits: 0,
    what: 'A public page showing exactly what passed and what did not.',
    why: 'Free, and the results are public including the failures. A badge that only ever says PASS is worth nothing, and everyone knows it.' },

  // ── Integrator-facing. APIs and AI. ──────────────────────────────────────
  { sku: 'api.contract', name: 'API contract test', payer: 'integrator', credits: 3900,
    what: 'Every declared endpoint against its schema, plus auth and rate-limit behaviour.',
    why: 'Bought by the party INTEGRATING, not the party publishing — they are the one carrying the risk of a change they did not make.' },
  { sku: 'api.drift', name: 'Drift monitoring', payer: 'integrator', credits: 4900, recurring: 'monthly',
    what: 'Alerts the moment a response shape changes, before it reaches production.',
    why: 'The single thing every integrator actually fears. Highest-margin product here because the alternative is finding out from an incident.' },
  { sku: 'ai.guardrail', name: 'AI guardrail audit', payer: 'integrator', credits: 9900,
    what: 'Every declared refusal tested, plus adversarial rephrasings of each.',
    why: 'A model update can silently break a guardrail that passed last month. Priced for the compliance budget, not the engineering one, because that is whose problem it is.' },
  { sku: 'ai.watch', name: 'AI behaviour monitoring', payer: 'integrator', credits: 7900, recurring: 'monthly',
    what: 'Re-runs on every model or prompt change.',
    why: 'Guardrails decay silently. Nobody notices until it matters, which is exactly when noticing is most expensive.' },

  // ── Website ──────────────────────────────────────────────────────────────
  { sku: 'web.audit', name: 'Accessibility and performance audit', payer: 'builder', credits: 1900,
    what: 'WCAG level verified against the claim, Core Web Vitals under real input, SEO surface.',
    why: 'Cheap enough to run on every project, which is the point — a tool used once a year finds nothing.' },
]

/** What to offer for a given artifact. Never offer a player-priced item on a tool. */
export function offersFor(kind: ArtifactKind): Product[] {
  if (kind === 'game') {
    return CATALOGUE.filter(p => p.payer === 'player' || p.sku.startsWith('audit.') || p.sku === 'badge.verified')
  }
  if (kind === 'api') return CATALOGUE.filter(p => p.sku.startsWith('api.') || p.sku === 'badge.verified')
  if (kind === 'ai') return CATALOGUE.filter(p => p.sku.startsWith('ai.') || p.sku === 'badge.verified')
  if (kind === 'website') return CATALOGUE.filter(p => p.sku.startsWith('web.') || p.sku.startsWith('audit.') || p.sku === 'badge.verified')
  return CATALOGUE.filter(p => p.payer === 'builder')
}

/**
 * Should assistance for this hidden path be sold at all? The unguided solver's
 * blind find rate decides, not the builder's opinion of how clever it is.
 */
export function assistancePolicy(input: {
  blindFound: boolean
  hasDiscoveryTell: boolean
  /** Absent when no unguided run has measured it yet. */
  observedFindRate?: number | undefined
}): { sellable: boolean; maxTier: 1 | 2 | 3; reason: string } {
  if (!input.hasDiscoveryTell) {
    return { sellable: false, maxTier: 1, reason:
      'No discovery tell. Nobody could find this unaided, so charging for the answer is charging for a design fault. Fix the design, do not price the confusion.' }
  }
  if (input.blindFound) {
    return { sellable: false, maxTier: 1, reason:
      'A blind run found it inside the budget. It is not hidden enough to be worth paying for, and offering to sell it looks cynical.' }
  }
  const rate = input.observedFindRate
  if (rate !== undefined && rate > 0.6) {
    return { sellable: true, maxTier: 1, reason:
      `${Math.round(rate * 100)}% of players find this unaided. Free nudge only.` }
  }
  if (rate !== undefined && rate < 0.02) {
    return { sellable: true, maxTier: 2, reason:
      `Only ${Math.round(rate * 100)}% find it. That is close to undiscoverable — cap at tier 2 and strengthen the tell.` }
  }
  return { sellable: true, maxTier: 3, reason:
    'Genuinely hidden, with a real tell in the world. Full tiered assistance is fair.' }
}

/** Revenue share with the creator whose artifact generated the assistance sale. */
export const CREATOR_SHARE = 0.7

export function settle(saleCredits: number): { creator: number; platform: number; note: string } {
  const creator = Math.round(saleCredits * CREATOR_SHARE)
  return {
    creator, platform: saleCredits - creator,
    note: '70% to the creator. They wrote the manifest, designed the secret and built the thing; ' +
          'we ran a test and took a payment. The split should reflect that, and a creator who ' +
          'feels fairly paid writes better manifests, which makes the whole engine better.',
  }
}
