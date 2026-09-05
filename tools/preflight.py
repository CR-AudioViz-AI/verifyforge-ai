#!/usr/bin/env python3
"""
tools/preflight.py

Run before shipping anything. Refuses if the platform's own rules are broken.

WHY. On 4 and 5 September this platform produced 119 instances of ten defect
patterns, and the reason they existed is not that anybody lacked the knowledge -
it is that the knowledge lived in a table nobody opened before writing code. A
lessons list that has to be remembered is a lessons list that gets skipped.

So this is not a document. It runs the checks, prints the rules that have no
check, and exits non-zero when something is wrong. The rules with no automated
check are printed EVERY time precisely because nothing else will stop them: two
of the ten patterns have no guard, and both were caused by me rather than by
anyone else's code.

    python3 tools/preflight.py              this repository
    python3 tools/preflight.py --rules      print the rules and stop

Exit 0 means every check that CAN run did run and passed. It does not mean the
work is correct - see the two unenforced rules, which only a person can honour.

CR AudioViz AI, LLC · EIN 39-3646201 · 2026-09-05
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.request

# Guards that exist in this repository are run. A guard that is absent is
# REPORTED as absent rather than skipped silently - a missing guard and a passing
# guard must never look the same, which is the whole reason javari-spirits shipped
# 36 IDORs while reporting PASS.
GUARDS = [
    ("route auth", "scripts/audit-route-auth.mjs"),
    ("schema columns", "scripts/audit-schema-columns.mjs"),
    ("supabase keys", "scripts/check-supabase-keys.mjs"),
    ("model names", "scripts/audit-model-names.mjs"),
    ("future dates", "scripts/audit-future-dates.mjs"),
]


def rules() -> list[dict]:
    base = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not base or not key:
        return []
    try:
        req = urllib.request.Request(
            f"{base}/rest/v1/defect_patterns?select=pattern,the_rule,enforced_by,instances&order=instances.desc",
            headers={"apikey": key, "Authorization": f"Bearer {key}", "User-Agent": "crav-preflight/1.0"},
        )
        with urllib.request.urlopen(req, timeout=30) as response:
            payload = json.loads(response.read())
        return payload if isinstance(payload, list) else []
    except Exception:
        return []


def print_unenforced(patterns: list[dict]) -> None:
    unenforced = [p for p in patterns if not p.get("enforced_by")]
    if not unenforced:
        return
    print("\nRULES NOTHING CHECKS. Only you can honour these.\n")
    for p in unenforced:
        print(f"  · {p['pattern']}  ({p['instances']}× so far)")
        print(f"      {p['the_rule']}\n")


def main() -> int:
    patterns = rules()

    if "--rules" in sys.argv:
        if not patterns:
            print("Could not read defect_patterns. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.")
            return 2
        for p in patterns:
            mark = "enforced" if p.get("enforced_by") else "NOT ENFORCED"
            print(f"[{mark}] {p['pattern']} ({p['instances']}×)")
            print(f"    {p['the_rule']}\n")
        return 0

    failures: list[str] = []
    absent: list[str] = []
    skipped: list[tuple[str, str]] = []
    passed = 0

    for label, path in GUARDS:
        if not os.path.isfile(path):
            absent.append(label)
            continue
        result = subprocess.run(
            ["node", path], capture_output=True, text=True, timeout=300
        )
        tail = (result.stdout or result.stderr or "").strip().split("\n")[-1][:100]

        # 2026-09-05: a SKIP is not a pass, and this tool reported one as a pass on
        # its first run.
        #
        # audit-model-names exits 0 with "skipped (no provider keys available)" when
        # it cannot reach a provider. Counting that as a pass is the exact defect
        # this platform has spent two days removing: a check that examined nothing
        # reporting the same result as a check that examined everything and found
        # nothing wrong.
        # Every phrasing a guard has used to mean "I did not run". Each was added
        # after that phrasing slipped through as a pass, which is why the list is
        # explicit rather than a single clever regex - a regex that misses one
        # produces a silent pass, and a silent pass is the thing being prevented.
        low = tail.lower()
        if any(w in low for w in ("skipped", "skipping", "no environment", "not present", "unavailable")):
            skipped.append((label, tail))
            print(f"  SKIP   {label:<18} {tail}")
        elif result.returncode == 0:
            passed += 1
            print(f"  pass   {label:<18} {tail}")
        else:
            failures.append(label)
            print(f"  FAIL   {label:<18} {tail}")

    if absent:
        print(f"\n  {len(absent)} guard(s) NOT PRESENT in this repository: {', '.join(absent)}")
        print("  A missing guard and a passing guard must never look the same. Copy them from core.")

    print_unenforced(patterns)

    if skipped:
        print(f"  {len(skipped)} guard(s) SKIPPED — they examined nothing:")
        for label, why in skipped:
            print(f"      {label}: {why}")
        print("  A skip is not a pass. Supply what they need, or know that this area is unchecked.")

    if failures:
        print(f"\n{len(failures)} guard(s) failed: {', '.join(failures)}. Nothing ships until they pass.")
        return 1

    print(f"\n{passed} guard(s) passed, {len(skipped)} skipped, {len(absent)} absent.")
    print("That covers what could be automated here, and not the rules above that nothing checks.")
    return 1 if skipped or absent else 0


if __name__ == "__main__":
    raise SystemExit(main())
