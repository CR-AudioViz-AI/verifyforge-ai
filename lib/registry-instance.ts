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

export function buildRegistry(): ModuleRegistry {
  const registry = new ModuleRegistry();
  registry.register(hollowResponseModule);
  registry.register(redirectIntegrityModule);
  registry.register(idorAccessModule);
  return registry;
}
