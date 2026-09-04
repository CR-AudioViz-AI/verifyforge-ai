/**
 * lib/registry-instance.ts
 *
 * The single place modules are registered. Adding a check to the product means
 * adding one line here. The registry enforces no duplicate IDs, mandatory blind
 * spots and the credit floor at registration, so a malformed module fails at
 * boot rather than mid-scan.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-23
 */

import { ModuleRegistry } from './modules/registry';
import { hollowResponseModule } from './modules/checks/hollow-response';
import { redirectIntegrityModule } from './modules/checks/redirect-integrity';
import { idorAccessModule } from './modules/checks/idor-access';
import { schemaColumnsModule } from './modules/checks/schema-columns';
import { runtimePerformanceCheck } from './modules/checks/runtime-performance';
import { mobileReadinessCheck } from './modules/checks/mobile-readiness';
import { gamePayloadCheck } from './modules/checks/game-payload';
import { modelGeometryCheck } from './modules/checks/model-geometry';
import { aiSafetyCheck } from './modules/checks/ai-safety';
import { accessibilityCheck } from './modules/checks/accessibility';
import { platformPostureCheck } from './modules/checks/platform-posture';
import { infraPostureCheck } from './modules/checks/infra-posture';
import { commerceIntegrityCheck } from './modules/checks/commerce-integrity';
import { authFlowCheck } from './modules/checks/auth-flow';
import { databaseExposureCheck } from './modules/checks/database-exposure';
import { dataResilienceCheck } from './modules/checks/data-resilience';
import { supplyChainCheck } from './modules/checks/supply-chain';
import { discoverabilityCheck } from './modules/checks/discoverability';
import { scopeCoverageCheck } from './modules/checks/scope-coverage';
import { functionIntegrityCheck } from './modules/checks/function-integrity';
import { exposedSecretsCheck } from './modules/checks/exposed-secrets';
import { securityPostureCheck } from './modules/checks/security-posture';

export function buildRegistry(): ModuleRegistry {
  const registry = new ModuleRegistry();
  registry.register(hollowResponseModule);
  registry.register(redirectIntegrityModule);
  registry.register(idorAccessModule);
  registry.register(schemaColumnsModule);

  // 2026-09-02: four modules existed and were UNREACHABLE. A check that is not
  // registered here cannot be planned, cannot be estimated, and cannot run — the
  // file compiles, the tests pass, and the capability does not exist.
  //
  // That is the same defect class as a route with no caller, and it is the reason
  // the registry is the single place modules are declared rather than being
  // discovered by directory scan: a missing line here is visible, a missing file
  // in a glob is not.
  registry.register(runtimePerformanceCheck);
  registry.register(mobileReadinessCheck);
  registry.register(gamePayloadCheck);
  registry.register(modelGeometryCheck);

  // 2026-09-02: ai_model was a declared target kind with ZERO checks against it,
  // while every other kind had at least one. That gap mattered most here, because
  // this platform ships AI in every app it builds — we were selling a scanner that
  // could not scan our own core product.
  registry.register(aiSafetyCheck);

  // ACCESSIBILITY was a declared category with no check behind it. It runs in a
  // real browser because almost every meaningful a11y defect only exists after
  // render: contrast is computed, tap-target size comes from the box model, and
  // an element hidden by CSS is not in the accessibility tree at all.
  registry.register(accessibilityCheck);

  // 2026-09-03: the ecosystem sweep found 536 defects and every one was about a
  // running page, because that is all the modules could examine. The defects that
  // did the most damage were invisible to all of them — 107 repos on strict:false,
  // a production site serving from an archived repo, a cron 401ing since creation.
  // Found by hand, once, with nothing to catch them recurring.
  registry.register(platformPostureCheck);
  registry.register(infraPostureCheck);

  // Money. Every other module answers "is this broken"; this one answers "can
  // somebody take money, or take value without paying" — and those defects are
  // silent by design. A webhook handler that accepts a forged event does not
  // error and does not slow down. It simply grants what it was asked to grant.
  registry.register(commerceIntegrityCheck);

  // Account takeover. Header defects degrade defences; an OAuth callback that
  // honours an attacker-supplied redirect hands over the authorisation code, and
  // the code is the account. There is no partial version of that failure.
  registry.register(authFlowCheck);

  // Supabase publishes the database over HTTP and the publishable key is in every
  // page. Row-level security is the only thing between a table and the internet:
  // a table with RLS off is not misconfigured, it is published.
  registry.register(databaseExposureCheck);

  // The control every framework asks for and almost nobody tests. A backup that
  // has never been restored is a hope: the failure modes only appear on the way
  // back - a schema that has moved on, a dependency order that will not replay,
  // an encryption key nobody kept.
  registry.register(dataResilienceCheck);

  // Everything the team pulled in rather than wrote. Almost always the larger
  // surface, and the only part of a codebase that can change while nobody
  // touches it: a dependency declared as ^1.2.0 is not a version, it is a
  // subscription.
  registry.register(supplyChainCheck);

  // Every other module asks whether the system works. This asks whether the work
  // reaches anybody. An app with no title, no canonical and no sitemap is
  // functioning perfectly and earning nothing, and that failure is invisible to
  // every check that only looks at behaviour.
  registry.register(discoverabilityCheck);

  // The most expensive lesson in this product: an OAuth open redirect was fixed
  // across eight repositories, declared closed, and found live three days later
  // on a host nobody had ever scanned. The check that would have caught it was
  // working correctly the whole time - it was never pointed at that host.
  registry.register(scopeCoverageCheck);

  // 2026-09-04: two functions on this platform - the ones that take a customer's
  // credits and give them back - had NEVER worked. Both referenced a column that
  // does not exist. PostgreSQL resolves function bodies at run time, so they
  // installed cleanly and failed silently on every call for months.
  registry.register(functionIntegrityCheck);

  // The `secrets` group had no check behind it. This one scans what was SERVED
  // rather than what is in the repo — a different set, and the difference is
  // where the damage is: a key becomes public the moment someone prefixes it
  // NEXT_PUBLIC_, and a key deleted from source months ago is still in a
  // deployed bundle until that bundle is replaced.
  registry.register(exposedSecretsCheck);
  registry.register(securityPostureCheck);
  return registry;
}
