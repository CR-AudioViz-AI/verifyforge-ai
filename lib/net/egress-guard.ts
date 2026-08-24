/**
 * lib/net/egress-guard.ts
 *
 * The egress guard — one boundary every outbound fetch in Verify must pass.
 *
 * A tool whose job is to fetch URLs the user supplies is, by nature, an SSRF
 * risk: point it at http://169.254.169.254/ and it will read cloud metadata;
 * point it at http://127.0.0.1:6379/ and it will poke internal services. CodeQL
 * flagged exactly this (js/request-forgery, critical) in the legacy crawler and
 * the live audit route. The answer is not to stop fetching — it is to fetch only
 * what is allowed, deliberately, at one checked boundary.
 *
 * This guard does three things, because doing fewer is the version that looks
 * done and isn't:
 *   1. Scheme allowlist — only http/https. No file:, gopher:, data:, etc.
 *   2. Host denylist — RFC1918, loopback, link-local (incl. 169.254.169.254),
 *      IPv6 ULA/::1, and .internal/.local suffixes are refused.
 *   3. DNS-resolution check — resolves the hostname and applies the same denylist
 *      to the RESOLVED address, so evil.com -> 127.0.0.1 cannot walk around a
 *      name-only check. This is the step a string check omits.
 *
 * It also refuses to follow redirects blindly: the caller fetches with
 * redirect:'manual' and re-guards each hop, so a 302 to an internal address is
 * caught too.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-23
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export interface GuardVerdict {
  readonly allowed: boolean;
  /** Why it was refused, for the audit trail. Empty when allowed. */
  readonly reason: string;
}

const ALLOWED_SCHEMES = new Set(['http:', 'https:']);

/** Suffixes that name internal networks by convention. */
const DENIED_HOST_SUFFIXES = ['.internal', '.local', '.localhost', '.cluster.local'];

const DENIED_HOSTNAMES = new Set(['localhost', 'metadata', 'metadata.google.internal']);

/**
 * Is a literal IP address in a range we must never reach? Covers IPv4 private,
 * loopback, link-local (including the cloud metadata address), and the IPv6
 * equivalents.
 */
export function isBlockedIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const parts = ip.split('.').map((p) => Number.parseInt(p, 10));
    const [a, b] = parts;
    if (a === undefined || b === undefined) return true; // malformed -> refuse
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // loopback
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
    if (a === 192 && b === 168) return true; // 192.168/16
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
    return false;
  }
  if (kind === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true; // loopback / unspecified
    if (lower.startsWith('fe80')) return true; // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA fc00::/7
    // IPv4-mapped IPv6 (::ffff:127.0.0.1) — extract and re-check.
    const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped?.[1] !== undefined) return isBlockedIp(mapped[1]);
    return false;
  }
  return true; // not a valid IP where one was expected -> refuse
}

function hostnameLooksInternal(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (DENIED_HOSTNAMES.has(h)) return true;
  return DENIED_HOST_SUFFIXES.some((suffix) => h.endsWith(suffix));
}

/**
 * The guard. Call before every outbound fetch, and again for every redirect hop.
 * Resolves DNS so a benign-looking hostname pointing at an internal IP is caught.
 */
export async function guardUrl(rawUrl: string): Promise<GuardVerdict> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { allowed: false, reason: 'Not a valid URL.' };
  }

  if (!ALLOWED_SCHEMES.has(url.protocol)) {
    return { allowed: false, reason: `Scheme "${url.protocol}" is not allowed; only http and https.` };
  }

  const hostname = url.hostname;

  if (hostnameLooksInternal(hostname)) {
    return { allowed: false, reason: `Host "${hostname}" names an internal network.` };
  }

  // If the host is already an IP literal, check it directly.
  if (isIP(hostname) !== 0) {
    if (isBlockedIp(hostname)) {
      return { allowed: false, reason: `Address ${hostname} is in a private, loopback, or link-local range.` };
    }
    return { allowed: true, reason: '' };
  }

  // Otherwise resolve and check every address the name maps to. A name that
  // resolves to ANY blocked address is refused — this is the anti-rebinding step.
  try {
    const results = await lookup(hostname, { all: true });
    if (results.length === 0) {
      return { allowed: false, reason: `Host "${hostname}" did not resolve.` };
    }
    for (const { address } of results) {
      if (isBlockedIp(address)) {
        return {
          allowed: false,
          reason: `Host "${hostname}" resolves to ${address}, a private or loopback address.`,
        };
      }
    }
    return { allowed: true, reason: '' };
  } catch {
    return { allowed: false, reason: `Could not resolve "${hostname}" to verify it is external.` };
  }
}

/**
 * A fetch that guards the initial URL and every redirect hop. Drop-in for the
 * raw fetch() calls the SSRF findings flagged: it follows redirects manually so
 * a 302 to an internal address is caught, not followed.
 */
export async function guardedFetch(
  rawUrl: string,
  init: RequestInit = {},
  maxRedirects = 5,
): Promise<Response> {
  let current = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const verdict = await guardUrl(current);
    if (!verdict.allowed) {
      throw new Error(`Egress blocked: ${verdict.reason}`);
    }
    const response = await fetch(current, { ...init, redirect: 'manual' });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location === null) return response;
      current = new URL(location, current).toString();
      continue;
    }
    return response;
  }
  throw new Error(`Egress blocked: exceeded ${maxRedirects} redirects.`);
}
