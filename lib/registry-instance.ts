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

  // The `secrets` group had no check behind it. This one scans what was SERVED
  // rather than what is in the repo — a different set, and the difference is
  // where the damage is: a key becomes public the moment someone prefixes it
  // NEXT_PUBLIC_, and a key deleted from source months ago is still in a
  // deployed bundle until that bundle is replaced.
  registry.register(exposedSecretsCheck);
  registry.register(securityPostureCheck);
  return registry;
}
