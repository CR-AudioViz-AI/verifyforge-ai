/**
 * e2e/support/tailwind-palette.ts
 *
 * Resolves a colour VALUE back to the Tailwind palette entry it came from.
 *
 * WHY THIS EXISTS. The forbidden-colour check used to grep the rendered HTML for
 * class strings — `bg-emerald`, `text-emerald`, and so on. app/page.tsx is styled
 * with inline `style={{ color: '#10b981' }}`, and #10b981 IS emerald-500. The
 * banned colour was on the page, the check that exists to catch banned colours
 * reported green, and the only reason anyone noticed was a different test
 * complaining that the approved colours were missing.
 *
 * A check that passes because it is looking at the wrong representation is the
 * exact defect this product sells the detection of. Our own suite does not get
 * to have one.
 *
 * The palette is read from the INSTALLED tailwindcss package, never from a
 * remembered table of hex values. If the dependency's palette changes, this
 * follows it; a hardcoded table would silently drift and start passing things it
 * should catch.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-23
 */

import tailwindColors from 'tailwindcss/colors';

/** Families banned by Henderson brand standards. */
export const FORBIDDEN_FAMILIES = [
  'purple',
  'violet',
  'emerald',
  'amber',
  'pink',
  'rose',
  'indigo',
  'fuchsia',
] as const;

export type ForbiddenFamily = (typeof FORBIDDEN_FAMILIES)[number];

export interface PaletteMatch {
  /** Normalised #rrggbb that matched. */
  readonly hex: string;
  readonly family: ForbiddenFamily;
  /** Tailwind shade key, e.g. "500". */
  readonly shade: string;
}

/**
 * Normalises a hex literal to lowercase #rrggbb, or returns null if it is not
 * one. Accepts #rgb, #rrggbb and #rrggbbaa; alpha is dropped, because a banned
 * colour at 80% opacity is still a banned colour.
 */
export function normalizeHex(raw: string): string | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(raw.trim());
  if (m === null) return null;
  const body = (m[1] ?? '').toLowerCase();
  if (body.length === 3) {
    const r = body[0] ?? '';
    const g = body[1] ?? '';
    const b = body[2] ?? '';
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return `#${body.slice(0, 6)}`;
}

/**
 * Converts a computed `rgb(r, g, b)` / `rgba(r, g, b, a)` value to #rrggbb.
 * Returns null for anything else, and for fully transparent colours — those are
 * not visible and flagging them would be noise.
 */
export function rgbToHex(value: string): string | null {
  const m = /^rgba?\(\s*([0-9.]+)[,\s]+([0-9.]+)[,\s]+([0-9.]+)\s*(?:[,/]\s*([0-9.%]+)\s*)?\)$/i.exec(
    value.trim(),
  );
  if (m === null) return null;

  const alphaRaw = m[4];
  if (alphaRaw !== undefined) {
    const alpha = alphaRaw.endsWith('%')
      ? Number.parseFloat(alphaRaw) / 100
      : Number.parseFloat(alphaRaw);
    if (Number.isFinite(alpha) && alpha === 0) return null;
  }

  const channel = (raw: string | undefined): string => {
    const n = Math.round(Number.parseFloat(raw ?? 'NaN'));
    if (!Number.isFinite(n) || n < 0 || n > 255) return '';
    return n.toString(16).padStart(2, '0');
  };

  const r = channel(m[1]);
  const g = channel(m[2]);
  const b = channel(m[3]);
  if (r === '' || g === '' || b === '') return null;
  return `#${r}${g}${b}`;
}

type Palette = Record<string, string | Record<string, string> | undefined>;

/** hex -> which forbidden palette entry it is. Built once from the dependency. */
function buildIndex(): ReadonlyMap<string, { family: ForbiddenFamily; shade: string }> {
  const index = new Map<string, { family: ForbiddenFamily; shade: string }>();
  const palette = tailwindColors as unknown as Palette;

  for (const family of FORBIDDEN_FAMILIES) {
    const shades = palette[family];
    if (shades === undefined || typeof shades === 'string') continue;
    for (const [shade, value] of Object.entries(shades)) {
      const hex = normalizeHex(value);
      if (hex === null) continue;
      // First family wins on a tie so the report is deterministic; the palette
      // has no duplicate hexes across these eight families today.
      if (!index.has(hex)) index.set(hex, { family, shade });
    }
  }
  return index;
}

const FORBIDDEN_BY_HEX = buildIndex();

/** How many palette entries are being enforced. A guard against an empty index. */
export function forbiddenEntryCount(): number {
  return FORBIDDEN_BY_HEX.size;
}

/**
 * Resolves any colour value — hex literal or computed rgb()/rgba() — to the
 * forbidden palette entry it names, or null if it is not a banned colour.
 */
export function resolveForbidden(value: string): PaletteMatch | null {
  const hex = normalizeHex(value) ?? rgbToHex(value);
  if (hex === null) return null;
  const hit = FORBIDDEN_BY_HEX.get(hex);
  if (hit === undefined) return null;
  return { hex, family: hit.family, shade: hit.shade };
}

/**
 * Every banned colour appearing as a hex literal anywhere in a document's markup
 * — inline style attributes, <style> blocks, SVG fills. Deduplicated.
 */
export function findForbiddenHexLiterals(markup: string): PaletteMatch[] {
  const seen = new Map<string, PaletteMatch>();
  for (const raw of markup.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) {
    const match = resolveForbidden(raw);
    if (match !== null && !seen.has(match.hex)) seen.set(match.hex, match);
  }
  return [...seen.values()];
}
