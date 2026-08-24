# Javari Verify — proof suite

These tests prove the product's promises, not just that the code compiles. Each
assertion maps to a claim we make to customers. If one fails, we are about to
tell a customer something untrue — so these must stay green before any merge.

## What each suite proves

**proof.claims.ts** — runs live against example.com and docs.claude.com:
- Registry rejects duplicate module IDs and modules with no declared blind spots.
- A check that cannot run at the target's access tier is reported, not skipped,
  and drags the verdict to INCOMPLETE — never a silent green.
- The redirect module finds real loops on a live site, each corroborated by five
  independent evidence paths, severity BLOCKER.
- hollow-response does NOT false-positive on a real, sparse page (example.com).
- A worthless credential is refused; the achieved tier downgrades to public.
- Measurements carry estimated=false — derived values can never masquerade as measured.

**proof.lifecycle.ts** — the "no marking your own homework" guarantee:
- A finding is verified fixed ONLY after an independent later run in which its
  module concluded and the finding was absent.
- A finding absent while its module did NOT conclude is carried as unverifiable,
  never closed. Absence of evidence is not evidence of a fix.
- A fixed finding that returns is flagged as a regression.

**proof.credentials.ts** — the deletion promise is a mechanism:
- The CredentialVault destroys every held credential, the secret is actually
  gone (not just flagged), and the receipt carries a destruction timestamp.
- The authorization matrix flags a lower-authority role reaching a higher-
  authority role's resource as a violation.

**proof.sarif.ts** — interop preserves honesty:
- INCOMPLETE scans emit executionSuccessful=false; inconclusive and did-not-run
  checks become warning notifications, never passing results.
- Declared blind spots ride into the GitHub rule help text.
- Round-trip ingest recovers findings; malformed SARIF degrades to zero findings
  without throwing.

## Run

    npx tsx test/proof.claims.ts        # needs network (live targets)
    npx tsx test/proof.lifecycle.ts
    npx tsx test/proof.credentials.ts
    npx tsx test/proof.sarif.ts

CR AudioViz AI, LLC · EIN 39-3646201
