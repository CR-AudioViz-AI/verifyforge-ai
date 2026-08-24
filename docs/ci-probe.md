# CI trigger probe — throwaway

This file exists only to give a pull request a diff. It is deleted with the
probe branch and never reaches `main`.

It is deliberately a `.md` file. The probe therefore tests two things at once:

1. **Stacked base.** The PR targets a branch other than `main`, which is the
   case that received zero CI runs before #64 (see #63).
2. **`paths-ignore`.** A docs-only change used to be skipped by the e2e
   workflow entirely. With these checks required in branch protection, a
   workflow that skips produces no check run, and a required check that never
   appears blocks the PR permanently.

Expected: RED half (pre-#64) zero check runs. GREEN half (post-#64)
`typecheck-and-prove` and `e2e-tests` both present.
