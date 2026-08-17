# VerifyForge

End-to-end verification for everything built in the CR AudioViz AI ecosystem —
games, apps, tools, websites, APIs and AI — and for anything a customer brings
from outside.

Live at **verifyforgeai.com**. Repo `CR-AudioViz-AI/javari-verify`.

---

## The one rule

**Charge the party whose problem it is.**

A player stuck in a game is the product working as intended — charge the player.
A user stuck in a tool is the product failing — charge the **builder**, and give
the user the answer free. Charging someone to discover our own defect is
charging them for our mistake, and it is the fastest way to be resented.

That single distinction is what stops this becoming a tollbooth on other
people's design failures, which is a business that works for about a year.

---

## How the pieces fit

| File | Does |
|---|---|
| `lib/manifest/artifact.ts` | The manifest every artifact publishes. 7 kinds, per-kind revenue models. |
| `lib/engine/crawler.ts` | Finds what was **actually** shipped, including routes only referenced in JS bundles. Flags exposures. |
| `lib/engine/solver.ts` | Guided solve proves completability. Unguided solve finds undeclared paths and measures real blind find rates. |
| `lib/engine/billing.ts` | The catalogue, and `assistancePolicy` — refuses to sell hints for anything with no discovery tell. |
| `lib/engine/gate.ts` | Delivery gate. Billing by origin, remediation planning, hold-on-blocker. |
| `app/api/audit/route.ts` | One audit endpoint for every artifact kind. |
| `app/api/gate/route.ts` | What a build pipeline calls before handover. |
| `worker/index.js` | Headless Chrome with SwiftShader. Real WebGL2 with no GPU. |
| `packages/manifest-kit/` | Drop into any app. Generates capabilities from the route tree at build time. |

---

## The delivery model

**We build it → audit is included.** Verifying our own work is our cost.
**We change it → included.** Part of delivering the change.
**Customer edits it → billable.** Re-certifying work we did not do is a service.
**Brought from outside → billable.** That is the product.

A **blocker holds the handover**, and nothing further is billed while we fix it.

`isMaterialChange` is deliberately narrow: a customer editing a headline is not
billed. Auth, API contracts, routes and dependencies are material. Content is not.

---

## Three edges the model has, and how each is guarded

**The cost hole.** Audits run at delivery, not on every save. A rebuild with no
material change inside 24 hours reuses the last certificate.

**The infinite loop.** Findings split three ways — auto-fixable, needs-a-human,
unknown. Attempts capped at three. A rendering fault needs eyes; deleting an
exposed route is a judgement call; whether an undeclared path is a secret or a
hole is a design question.

**The opacity trap.** Every result lists what was found and what was changed.
Silently fixing things and reporting "QA complete" trains a customer to believe
the process is magic. The honesty is the advertisement.

---

## What it has already caught

First worker run against The Vault: scene rendering black, **7,104ms of blocked
main thread across 14 long tasks**, 2fps under software rendering. The long-task
finding is the INP warning Roy was seeing, and it got worse when hint panels
were added — they set React state from inside the frame loop.

The crawler's exposure rules exist because `/api/setup` and `/api/admin/migrate`
were live on zoyzy.com publishing full schema and a hardcoded secret. Both would
have been caught on a first crawl.

---

## Still to wire

- `VERIFYFORGE_WORKER_URL` pointing at a deployed worker
- The gate called from Javari AI's build pipeline
- manifest-kit rolled into the 54 properties
- Public results pages
- Credit deduction against the platform ledger

CR AudioViz AI, LLC · EIN 39-3646201
