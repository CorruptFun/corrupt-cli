# Used-Car Dealership Site — White-Label Template

Public inventory site + admin portal for a used-car dealership. Backed by
Supabase (Postgres + RLS, Auth, Storage, Edge Functions); deploys to Vercel.

> Agent instructions live in `AGENTS.md` (imported by `CLAUDE.md`).
> **Read the security model below before touching anything in `supabase/`.**

## Rebranding this template

> **Automated path:** the Corrupt MCP server stands this whole tier up end-to-end
> from API tokens — scaffold + config generation, Supabase project + schema +
> secrets, edge function, Vercel deploy, and the RLS security gate. See
> `corrupt-mcp/README.md` (`standup_dealership_pro`). The steps below are the
> equivalent manual runbook.

This is a template, not a finished site for a specific dealership. To turn it
into one:

1. **Edit `src/config/site.ts`.** Brand name, phone, email, address, site
   URL, social links, and lot locations all live in this one file — every
   component imports its display text from here. See the comments in that
   file for what each field controls.
2. **Copy `.env.example` to `.env.local`** and fill in your Supabase project
   URL and anon key. `.env.local` is gitignored; never commit real values.
3. **Set Supabase Edge Function secrets** (Resend API key, webhook secret,
   notification recipients) — see `supabase/README.md` and the comments at
   the top of `.env.example`. These are configured on the Supabase project,
   not in `.env.local`.
4. **Seed your first super admin** after applying
   `supabase/migrations/0001_initial_schema.sql` — the two required post-apply
   steps (insert the super admin, set the Vault secrets) are documented at the
   bottom of that file. (The MCP stand-up does this for you.)
5. **Replace `public/dealership.jpg`**, `public/favicon.svg`, and the
   placeholder copy in `public/manifest.json` / `sitemap.xml` / `robots.txt`
   / `privacy.html` (these are static files and can't read `site.ts`, so
   their placeholder text is set directly — update it to match your config).
6. **Multi-lot dealership?** Add more entries to `siteConfig.locations` in
   `src/config/site.ts`. The location filter/tabs in the Showroom only
   appear once more than one location is configured. If your database
   enforces a CHECK constraint on `vehicles.location`, keep it in sync with
   the location `id`s you configure.

## Stack

| | |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind 4 |
| Backend | Supabase — Postgres + RLS, Auth, Storage, Edge Functions |
| Email | Resend (via a Supabase edge function) |
| Hosting | Vercel |

## Layout

```
src/config/site.ts             brand/contact/location config — edit this to rebrand
src/app/page.tsx                public site (inventory browsing)
src/app/admin/page.tsx          admin login (email OTP)
src/components/admin/           AdminDashboard + Inventory, VehicleForm,
                                Applications, Whitelist, ErrorLogs, Stats
src/components/home/            public sections (financing, contact, vehicle modal)
src/lib/supabase/               browser + server clients (anon key only)
src/lib/types.ts                shared types (incl. VehicleLocation)
src/lib/i18n.tsx                EN/ES language toggle
src/proxy.ts                    Next 16 middleware equivalent — refreshes the auth
                                cookie ONLY. It does not gate routes; RLS does.
supabase/migrations/            schema + policy history  <- read its README first
supabase/functions/             edge functions (credit-app notification email)
```

## Database

| Table | Purpose | Public access |
|---|---|---|
| `vehicles` | Inventory | anon **read** only |
| `credit_applications` | Financing / inquiry leads | anon **insert** only |
| `authorized_admins` | Admin allow-list | admin only |
| `error_logs` | Client error reporting | anon **insert** only |

Inventory is **entered manually** by dealership staff through the admin portal.

## Security model — read before changing policies

**RLS is the entire access-control layer.** The app talks to Supabase directly from
the browser using **only the anon key** (`src/lib/supabase/client.ts`, `server.ts` —
`NEXT_PUBLIC_SUPABASE_ANON_KEY`). There is no server-side API layer and no
`service_role` usage in app code. If a policy is wrong, there is no second line of
defence.

**How admin access actually works:**

1. `src/app/admin/page.tsx` calls `is_email_authorized` before sending an OTP.
   **This is a UX gate only** — it stops the wrong person seeing a login form. It is
   client-side and proves nothing.
2. `signInWithOtp` -> `verifyOtp` -> the user holds an `authenticated` JWT.
3. **The real boundary:** every sensitive policy checks
   `lower(auth.jwt() ->> 'email') IN (SELECT lower(email) FROM authorized_admins)`.

Add/remove admins via the portal's **Whitelist** tab (writes `authorized_admins`).

**Two admin levels**, both driven by data in `authorized_admins` — not by anything
hardcoded in a policy:

| Level | Column | Can do |
|---|---|---|
| Admin | `is_super_admin = false` | Inventory, credit applications, error logs. Sees only their own row in `authorized_admins`. |
| Super admin | `is_super_admin = true` | All of the above, plus add/remove admins and read the full list. |

Policies on `authorized_admins` call `public.is_super_admin()`, which is
`SECURITY DEFINER` **on purpose**: a policy on `authorized_admins` that queried
`authorized_admins` directly would re-enter itself and Postgres would raise
*"infinite recursion detected in policy"*. Running as the function owner breaks the
cycle. If you touch that function, keep `SECURITY DEFINER` and the pinned
`search_path`.

Promoting someone to super admin is deliberately **not** a portal action — there is
no `UPDATE` policy on `authorized_admins`. Do it in SQL (the `authorized_admins`
table and its policies are defined in `supabase/migrations/0001_initial_schema.sql`).

**Self-signup is intentionally left enabled.** `signInWithOtp` is called without
`shouldCreateUser: false`, so anyone can register an auth user. This is deliberate:
disabling it would break the Whitelist tab, because a newly whitelisted admin has no
auth user yet and could never receive a first OTP. It is safe *because* RLS is
whitelist-scoped — a self-registered stranger can do nothing. **Do not "fix" this
without first replacing the admin-invite flow.**

### Three rules for writing RLS policies here

1. **`service_role` bypasses RLS.** It never needs a policy. A policy named
   "service role ..." granted `TO public` does not scope anything to service_role —
   it opens the table to the entire internet, anonymously.
2. **`TO public` means everyone**, including `anon`. Say `TO authenticated`.
3. **Postgres ORs permissive policies.** A tight policy sitting beside a loose
   `USING(true)` one does not win. Replacing a policy means dropping it **by its
   actual name** — check `pg_policies`, not just the SQL files.

After any policy change, run:

```sql
SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname='public' ORDER BY tablename, policyname;
```

Only **three** results should be wide open, and all are intentional: `vehicles`
SELECT (public browsing), `credit_applications` INSERT (public submission),
`error_logs` INSERT (public error reporting).

Storage policies live on `storage.objects`, in a **separate schema** from the table
policies above — an audit that only checks `pg_policies WHERE schemaname='public'`
will miss them. Check both.

## Tests

```bash
./supabase/tests/rls_regression.sh
```

Asserts what the policies are *supposed* to allow, for each identity that matters:
anonymous visitor, self-registered stranger, whitelisted admin, super admin. It
simulates identities via `request.jwt.claims` (what `auth.jwt()` reads), runs
everything inside transactions that are rolled back, and writes nothing — safe
against production. Requires an admin and a super-admin row already present in
`authorized_admins`; override the addresses it checks with `RLS_TEST_ADMIN_EMAIL`
and `RLS_TEST_SUPER_EMAIL` if you don't want to use its placeholder defaults.

**Run it after any change under `supabase/`.**

## Vehicle photos — storage layout

**Every photo lives at `<vehicle-uuid>/<timestamp>-<rand>.<ext>` in the
`vehicle-photos` bucket.** The path *is* the record of ownership — this is
enforced, not just a convention:

- **Enforced, not just intended.** The storage INSERT policy (in
  `0001_initial_schema.sql`) rejects any upload that is not `<uuid>/<file>`, so the
  bucket cannot drift into flat, unattributed files.
- **The id is minted client-side.** `VehicleForm.tsx` generates the vehicle's UUID
  with `crypto.randomUUID()` *before* uploading, because photos upload before the
  row is inserted. The same value is used for the path and the insert, so they can
  never disagree.
- **The policy checks shape, not existence.** It deliberately does *not* require the
  UUID to match a live vehicle — that would reject every new listing, since the row
  does not exist yet at upload time. "Does this folder still have a vehicle?" is the
  cleanup tool's job, not the upload policy's.
- **`images` may also hold full external URLs** (e.g. from a legacy import). Anything
  starting with `http` is left alone and never moved or deleted.

A vehicle can have any number of photos — the admin file input accepts `multiple`,
and `VehicleDetailsModal` renders a thumbnail gallery whenever `images.length > 1`.

**Deletion must go through the Storage API, never SQL:** `storage.objects` has a
`protect_objects_delete` trigger blocking direct row deletes, and removing just the
row would strand the real file in storage anyway. Deleting a vehicle removes its
photos; marking one **sold** offers to as well (sold vehicles are hidden from the
site, so their photos become dead weight) — that prompt never blocks the save,
since marking sold is reversible and deleting photos is not.

**Maintenance:** *Inventory → Tidy Photos* in the admin portal (super admins only)
files any loose root-level photos under their vehicle and deletes anything no
vehicle references. Idempotent; safe to re-run.
`supabase/tools/audit_orphaned_photos.sh` reports the same, read-only.

## Lead capture flow

Public form (`FinancingSection.tsx`, `VehicleDetailsModal.tsx`)
-> insert into `credit_applications`
-> `AFTER INSERT` trigger `tr_notify_credit_app_webhook` (in `0001_initial_schema.sql`)
-> edge function `send-credit-app-notification` (validates a shared secret
   fail-closed, HTML-escapes all fields)
-> Resend: dealer inboxes + customer confirmation
-> Supabase Realtime pushes the lead into the admin **Applications** tab live.

## Accepted risks (deliberate — don't "fix" without understanding why)

- **`is_email_authorized` is anon-executable**, making it an admin-email oracle.
  Anon *must* be able to call it: it runs before login to decide whether to send an
  OTP. Knowing an address is an admin grants nothing without that inbox, and RLS is
  the real boundary.
- **No rate limiting on public inserts.** `credit_applications` and `error_logs`
  accept anonymous inserts, and each application fires a Resend email via trigger.
  Both public forms have honeypots, which stops naive bots but not a determined
  attacker. Throttling would mean touching the notification trigger — the most
  revenue-critical path here — so it deserves its own deliberate change.
- **`service_role` key** is never used by app code and should stay that way. If
  anything in this stack is ever given the `service_role` key, rotate it the moment
  that component is retired — it bypasses every policy in this repo.

## Local development

```bash
npm install
npm run dev            # http://localhost:3000
```

Copy `.env.example` to `.env.local` and fill in real values (see that file for what
each variable does and where Edge Function secrets are configured instead).

Migrations are applied by hand — there is no Supabase CLI link by default:

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/<file>.sql
```

## Known gaps

- **No application-level test coverage.** Database access control is covered
  (`supabase/tests/rls_regression.sh`) because that is where the real risk has
  proven to be; the React components have no tests.
- **`VehicleLocation` is a plain `string`** in `src/lib/types.ts`, driven by
  `siteConfig.locations` rather than a fixed union. If your database enforces a
  CHECK constraint on `vehicles.location`, you are responsible for keeping it in
  sync with the location `id`s in your config — the type system won't catch a
  mismatch for you.
