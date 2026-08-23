/**
 * lib/api/resolve.ts
 *
 * Validation and coercion of untrusted request bodies into engine types.
 *
 * Every value here comes from the network and is treated as hostile until
 * proven otherwise. The engine's type safety only holds if nothing crosses this
 * boundary unchecked, so this file is deliberately paranoid: it returns a
 * discriminated error rather than throwing, so a malformed request becomes a
 * clear 400 instead of a 500.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-23
 */

import { NextResponse, type NextRequest } from 'next/server';
import type { ScanProfile } from '@/lib/modules/contract';
import {
  ACCESS_TIERS,
  type AccessTier,
  type Authorization,
  type Target,
  type TargetKind,
} from '@/lib/modules/target';
import type { AuthProof, SessionStrategy } from '@/lib/engine/session';

export type Resolved<T> = { kind: 'ok'; value: T } | { kind: 'error'; message: string };

export function jsonError(status: number, message: string): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function str(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

const TARGET_KINDS: readonly TargetKind[] = [
  'web_property', 'http_api', 'ai_model', 'mobile_app', 'game',
  'tool', 'repository', 'database', 'payment_integration', 'auth_provider',
];

function isTargetKind(value: string): value is TargetKind {
  return (TARGET_KINDS as readonly string[]).includes(value);
}

function isAccessTier(value: string): value is AccessTier {
  return (ACCESS_TIERS as readonly string[]).includes(value);
}

export function resolveTarget(body: unknown): Resolved<Target> {
  const root = asRecord(body);
  const targetRaw = root === null ? null : asRecord(root['target']);
  if (targetRaw === null) return { kind: 'error', message: 'Missing "target" object.' };

  const kind = str(targetRaw, 'kind');
  const address = str(targetRaw, 'address');
  const tier = str(targetRaw, 'accessTier') ?? 'public';

  if (kind === null || !isTargetKind(kind)) {
    return { kind: 'error', message: `Invalid target.kind. One of: ${TARGET_KINDS.join(', ')}.` };
  }
  if (address === null) return { kind: 'error', message: 'Missing target.address.' };
  if (!isAccessTier(tier)) {
    return { kind: 'error', message: `Invalid target.accessTier. One of: ${ACCESS_TIERS.join(', ')}.` };
  }
  try {
    if (kind === 'web_property' || kind === 'http_api') new URL(address);
  } catch {
    return { kind: 'error', message: `target.address is not a valid URL: ${address}` };
  }

  const authRaw = asRecord(targetRaw['authorization']);
  const authorization: Authorization =
    authRaw !== null && authRaw['kind'] === 'owned'
      ? { kind: 'owned', note: str(authRaw, 'note') ?? 'owner-declared' }
      : authRaw !== null && authRaw['kind'] === 'granted'
        ? {
            kind: 'granted',
            grantedBy: str(authRaw, 'grantedBy') ?? 'unknown',
            grantedAt: str(authRaw, 'grantedAt') ?? new Date().toISOString(),
            reference: str(authRaw, 'reference') ?? 'unspecified',
          }
        : { kind: 'none' };

  const rpsRaw = targetRaw['rateLimitRps'];
  const rateLimitRps = typeof rpsRaw === 'number' && rpsRaw > 0 && rpsRaw <= 50 ? rpsRaw : 2;

  return {
    kind: 'ok',
    value: {
      id: str(targetRaw, 'id') ?? `tgt_${Date.now().toString(36)}`,
      kind,
      label: str(targetRaw, 'label') ?? address,
      address,
      accessTier: tier,
      authorization,
      rateLimitRps,
      respectRobotsTxt: targetRaw['respectRobotsTxt'] !== false,
    },
  };
}

export function resolveProfile(body: unknown): Resolved<ScanProfile> {
  const root = asRecord(body);
  const profileRaw = root === null ? null : asRecord(root['profile']);
  if (profileRaw === null) return { kind: 'error', message: 'Missing "profile" object.' };

  const moduleIdsRaw = profileRaw['moduleIds'];
  if (!Array.isArray(moduleIdsRaw) || moduleIdsRaw.length === 0) {
    return { kind: 'error', message: 'profile.moduleIds must be a non-empty array.' };
  }
  const moduleIds = moduleIdsRaw.filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (moduleIds.length === 0) {
    return { kind: 'error', message: 'profile.moduleIds contained no valid module IDs.' };
  }

  const inputsRaw = asRecord(profileRaw['inputs']) ?? {};
  const inputs: Record<string, string> = {};
  for (const [key, value] of Object.entries(inputsRaw)) {
    if (typeof value === 'string') inputs[key] = value;
  }

  const first = moduleIds[0];
  if (first === undefined) {
    return { kind: 'error', message: 'profile.moduleIds is empty after validation.' };
  }

  return {
    kind: 'ok',
    value: {
      id: str(profileRaw, 'id') ?? `prof_${Date.now().toString(36)}`,
      name: str(profileRaw, 'name') ?? 'Custom scan',
      moduleIds: [first, ...moduleIds.slice(1)],
      inputs,
    },
  };
}

/** The approved profile from /plan, passed back verbatim. Same shape as profile. */
export function resolveApprovedProfile(body: unknown): Resolved<ScanProfile> {
  const root = asRecord(body);
  if (root !== null && root['approvedProfile'] !== undefined) {
    return resolveProfile({ profile: root['approvedProfile'] });
  }
  return resolveProfile(body);
}

export function resolveSession(
  body: unknown,
): Resolved<{ strategy: SessionStrategy; proof: AuthProof | null }> {
  const root = asRecord(body);
  const authRaw = root === null ? null : asRecord(root['auth']);

  // No auth block means an anonymous, public-tier scan. Legitimate and common.
  if (authRaw === null) {
    return { kind: 'ok', value: { strategy: { kind: 'anonymous' }, proof: null } };
  }

  const kind = str(authRaw, 'kind');
  let strategy: SessionStrategy;

  switch (kind) {
    case 'bearer': {
      const token = str(authRaw, 'token');
      if (token === null) return { kind: 'error', message: 'auth.token required for bearer.' };
      strategy = { kind: 'bearer', token };
      break;
    }
    case 'cookie': {
      const cookieHeader = str(authRaw, 'cookieHeader');
      if (cookieHeader === null) return { kind: 'error', message: 'auth.cookieHeader required.' };
      strategy = { kind: 'cookie', cookieHeader };
      break;
    }
    case 'form_login': {
      const loginUrl = str(authRaw, 'loginUrl');
      const username = str(authRaw, 'username');
      const password = str(authRaw, 'password');
      if (loginUrl === null || username === null || password === null) {
        return { kind: 'error', message: 'form_login requires loginUrl, username, password.' };
      }
      strategy = {
        kind: 'form_login',
        loginUrl,
        username,
        password,
        usernameField: str(authRaw, 'usernameField') ?? 'username',
        passwordField: str(authRaw, 'passwordField') ?? 'password',
        ...(str(authRaw, 'csrfFieldName') !== null
          ? { csrfFieldName: str(authRaw, 'csrfFieldName') as string }
          : {}),
      };
      break;
    }
    case 'supabase_password': {
      const projectUrl = str(authRaw, 'projectUrl');
      const anonKey = str(authRaw, 'anonKey');
      const email = str(authRaw, 'email');
      const password = str(authRaw, 'password');
      if (projectUrl === null || anonKey === null || email === null || password === null) {
        return { kind: 'error', message: 'supabase_password requires projectUrl, anonKey, email, password.' };
      }
      strategy = { kind: 'supabase_password', projectUrl, anonKey, email, password };
      break;
    }
    case 'anonymous':
    default:
      strategy = { kind: 'anonymous' };
  }

  const proofRaw = asRecord(authRaw['proof']);
  let proof: AuthProof | null = null;
  if (proofRaw !== null) {
    const probeUrl = str(proofRaw, 'probeUrl');
    const marker = str(proofRaw, 'expectAuthenticatedMarker');
    if (probeUrl !== null && marker !== null) {
      proof = {
        probeUrl,
        expectAuthenticatedMarker: marker,
        ...(str(proofRaw, 'expectAnonymousMarker') !== null
          ? { expectAnonymousMarker: str(proofRaw, 'expectAnonymousMarker') as string }
          : {}),
      };
    }
  }

  // A credentialed strategy with no proof is refused. The session layer would
  // downgrade it to public anyway; failing here tells the caller why up front.
  if (strategy.kind !== 'anonymous' && proof === null) {
    return {
      kind: 'error',
      message:
        'An authenticated scan requires auth.proof (probeUrl + expectAuthenticatedMarker) ' +
        'so authority can be verified. Without it, authentication cannot be proven and ' +
        'the scan would silently run as anonymous.',
    };
  }

  return { kind: 'ok', value: { strategy, proof } };
}

export type OwnerResult =
  | { kind: 'ok'; userId: string }
  | { kind: 'error'; status: number; message: string };

/**
 * Resolves the authenticated caller. The real implementation validates the
 * Supabase JWT in the Authorization header; here it enforces the presence of a
 * bearer token so the route cannot run unauthenticated, and hands the token
 * through for the credit layer to resolve.
 */
export async function requireOwner(request: NextRequest): Promise<OwnerResult> {
  const authorization = request.headers.get('authorization');
  if (authorization === null || !authorization.startsWith('Bearer ')) {
    return { kind: 'error', status: 401, message: 'Authentication required.' };
  }
  const token = authorization.slice('Bearer '.length).trim();
  if (token.length === 0) {
    return { kind: 'error', status: 401, message: 'Empty bearer token.' };
  }
  // Placeholder resolution: the real version verifies the JWT signature and
  // reads the sub claim. Kept explicit so it cannot be mistaken for verified.
  return { kind: 'ok', userId: `user:${token.slice(0, 12)}` };
}
