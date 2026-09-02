# Test identities

**2 September 2026.** The accounts Javari Verify uses to reach past the public tier,
and the rule about which one is allowed where.

## The four tiers

| Account | Role | Tests |
|---|---|---|
| `royhenderson@craudiovizai.com` | `super_admin` | super-admin surfaces |
| `cindyhenderson@craudiovizai.com` | `admin` | admin surfaces |
| `royhenders@gmail.com` | `user` | end user — **identity A** |
| `royhenders@yahoo.com` | `user` | end user — **identity B** |
| `verify-e2e-ci@craudiovizai.com` | `user` | unattended CI runs |

## Why two end-user accounts and not one

Authorisation defects between users are invisible to a single login. `idor-access`
requires `userB_probeUrl`, `userB_marker` and `userB_auth_kind` because the assertion it
makes is *"A requested B's record and received 200 with B's data in it."*

With one account there is no B, and the check cannot run at all. This is the single most
valuable thing Verify tests and the one most scanners never find, precisely because
running it needs two real identities rather than a clever payload.

## The rule that is not negotiable

**An unattended scan never holds `super_admin` credentials.**

Intrusive checks send adversarial payloads at live endpoints — prompt injections,
object-reference probes, malformed input. At `user` role those are refused, which is the
result we want to measure. At `super_admin` some of them would succeed, and a scanner is
a thing that gets compromised.

`super_admin` and `admin` are for **attended** testing: a person running a scan against
staging, watching it, able to stop it. The recurring scans that run on a schedule use the
end-user accounts.

That distinction is also what keeps the audit trail readable. Every action a scan takes
appears in logs as whichever identity it used; if scans run as Roy, no log can separate
testing from the real thing during an incident.

## Seeded data is what makes the check mean something

Two logins alone prove nothing. `idor-access` needs a record **owned by B that A must not
see**, so a pass means "A tried and was refused" rather than "nothing was tried."

Without seeded fixtures the module reports a clean result for a probe that never had a
target — the same defect class as a scan with no modules selected returning CLEAR.

## What still cannot be reached

Even with all four accounts:

- **Anything requiring MFA at sign-in**, unless a session is supplied directly.
- **Role transitions** — whether a user can escalate themselves is a different test from
  whether a user can read another user's data.
- **Third-party identity providers.** OAuth flows need the provider's cooperation.
- **Data visible only after a real payment**, which no test account should ever make.
