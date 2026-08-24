# Testing as your users — how it works, and what happens to the credentials

**CR AudioViz AI, LLC · EIN 39-3646201**

To find the defects that matter — the ones where a normal user reaches something
only an admin should, or where one customer can read another's records — Javari
Verify signs in as your users and tests what each one can actually do. This page
explains exactly how, and exactly what happens to the credentials you give us.

---

## Why we test as real users

A scan of your public pages finds public problems. It cannot find the defect that
leaks your customers' data, because that defect only appears once someone is
signed in. To find those, the scanner has to be signed in too — as the kinds of
users your product actually has.

**The strongest way to do this is a test user inside your own system.** You
create accounts we can use, with the real roles your product uses, and we sign in
as each one. That way Verify sees precisely what a user of that role sees,
including the parts of your product that only exist behind a login, and it tests
the boundaries between roles that no anonymous scan can reach.

## The roles we test

You choose which of these apply to your product. Most have at least three.

**Normal customer.** The everyday signed-in user. We check what they can see and
do, and — critically — what they can reach that they should not be able to.

**Admin.** Elevated privileges. We test whether admin-only functions are actually
restricted to admins, and whether a normal customer can reach them by guessing a
URL or changing a parameter.

**Owner or super-admin.** The highest authority. We confirm the most sensitive
capabilities are genuinely gated.

With more than one role provisioned, Verify runs an **authorization matrix**: it
signs in as each role and tries to reach every other role's resources. A normal
customer reaching an admin's page is privilege escalation. One customer reaching
another customer's record is a data leak. These are the highest-severity findings
we produce, and they are impossible to find with a single login.

## What we ask you to provide

For each role you want tested, a working set of credentials in your system —
ideally **test accounts you create for this purpose**, not your real production
logins. A dedicated test user per role is safer for you and cleaner for us: it
isolates the testing, it cannot be confused with a real customer's activity, and
it can be removed the moment testing ends.

We also ask for one thing that makes the whole scan honest: **a way to prove the
login worked.** A page or value that only appears when signed in as that role.
Without it we cannot verify that we are actually authenticated, and we will not
claim to have tested something we could not confirm we reached.

---

## What happens to your credentials — the part that is not a promise but a mechanism

**We delete every credential you give us when testing completes.** This is not a
policy we ask you to trust. It is how the system is built.

- Credentials are held **in memory for the duration of the scan only.** They are
  never written to a database, never written to disk, and never included in a
  report.
- When the scan finishes — **including when it fails or is cancelled** — a
  cleanup step runs that overwrites and drops every credential. It runs in a path
  the scan cannot skip.
- You receive a **destruction receipt** with your report: each credential we
  held, when we received it, and the timestamp it was destroyed. If any credential
  shows as still held, the scan is not marked complete.
- Our logs mask secrets automatically. A credential cannot appear in a log line
  even by accident, because the logging layer strips anything that looks like a
  token, key, cookie or password before it is written.

**What we recommend regardless:** rotate or delete the test accounts on your side
after testing, the same way you would after any third party had access. Belt and
suspenders. Our deletion is real and provable; your rotation makes it certain.

## What we will not do

- We will not use production owner or super-admin credentials if a test account
  can do the job. The less authority we hold, the less risk to you.
- We will not run authorization or access-boundary tests against a target you
  have not confirmed you own or are authorized to test. That confirmation is
  required before any persona is established.
- We will not retain a credential "to make the next scan faster." Every scan
  re-establishes its sessions from credentials you provide at run time, and
  destroys them again at the end.

---

## In short

You give us test users for the roles that matter. We sign in as each, test what
they can and cannot reach — including across each other's boundaries — and hand
you findings you can re-verify yourself. Then we destroy the credentials, prove
we did, and recommend you rotate the accounts anyway.

That is how a scan finds the defects that actually leak data, without becoming a
risk of its own.

CR AudioViz AI, LLC · EIN 39-3646201 · Fort Myers, Florida
