# Pro Dealership Tier — Stand-Up Walkthrough

End-to-end guide for standing up a **Pro dealership site** (`corrupt-dealership-pro`
— Next.js + Supabase) using the Corrupt MCP server. This is the automated
equivalent of the manual runbook in
[`corrupt-dealership-pro/README.md`](../corrupt-dealership-pro/README.md); the
tools do every step from API tokens.

- **New here?** Read [`ARCHITECTURE.md`](ARCHITECTURE.md) first for how Pro
  compares to the Simple (static) tier and the SaaS engine.
- **Tool reference:** [`corrupt-mcp/README.md`](../corrupt-mcp/README.md).
- **Rendered read:** [`pro-standup-guide.html`](pro-standup-guide.html) — the same guide as a
  self-contained, on-brand HTML page.
- **Pick Pro when** the operator wants a real admin portal, database inventory,
  photo uploads, and a live lead inbox — and is willing to run Supabase + Vercel.
  For a cheap zero-backend brochure site, use the Simple tier instead.

---

## 1. What a finished stand-up looks like

When you're done, the client has:

| Piece | Created by | What it is |
|---|---|---|
| A Supabase project | `provision_supabase_dealership_pro` | Postgres + RLS, Auth, Storage, Vault, the lead-notification trigger |
| The database schema | same | `0001_initial_schema.sql`, applied once, with the first super admin seeded and the three Vault secrets set |
| An edge function | `deploy_function_dealership_pro` | `send-credit-app-notification` (emails leads via Resend) |
| A Vercel project + deploy | `deploy_vercel_dealership_pro` | the live Next.js site at `https://<project>.vercel.app` |
| A generated site folder | `scaffold_dealership_pro` | the app source, **outside this repo**, with `src/config/site.ts` + `.env.local` |
| A passing security gate | `verify_dealership_pro` | `rls_regression.sh` green against the new project |

Still **manual** afterward (Section 7): pointing the client's custom domain,
verifying the Resend sending domain, the first admin login, and entering
inventory.

---

## 2. Before you start

### 2.1 Host prerequisites

The MCP server runs on some machine (your laptop, a workstation). That host needs:

| Tool | Needed for | Notes |
|---|---|---|
| Python 3.10+ with `mcp` + `requests` | running the server + all Supabase/Vercel API calls | `pip3 install -r requirements-optional.txt` |
| `vercel` CLI | the Vercel **deploy** step | `npm i -g vercel`. The build runs in Vercel's cloud — no local `node_modules` needed |
| `psql` + `bash` | the `verify` step (`rls_regression.sh`) | any Postgres 14+ client works |
| `node` / `npm` | only if you want to run the site locally | not required for deploy |

Provisioning Supabase and deploying the edge function are **pure REST** — they do
**not** need the Supabase CLI, Deno, or Docker.

### 2.2 Register the MCP server

Add the server to your agent (Claude Desktop / Cursor / Claude Code). Put your
tokens in the server's **environment** so they never appear in chat:

```json
{
  "mcpServers": {
    "corrupt-engine": {
      "command": "python3",
      "args": ["/abs/path/to/corrupt-cli/corrupt-mcp/server.py"],
      "env": {
        "SUPABASE_ACCESS_TOKEN": "sbp_...",
        "VERCEL_TOKEN": "..."
      }
    }
  }
}
```

See [`corrupt-mcp/README.md`](../corrupt-mcp/README.md) for Cursor/virtualenv
variants. Every tool also accepts the tokens as arguments, but the env block is
the recommended, lower-exposure option.

### 2.3 Get your tokens

- **Supabase personal access token** (`SUPABASE_ACCESS_TOKEN`): create at
  <https://supabase.com/dashboard/account/tokens>. It **must** start with `sbp_`
  (a **personal access token**). A project key (`sb_secret_…`) will **not** work
  for the Management API. This token can create/modify every project in your orgs
  — treat it like a root credential.
- **Vercel token** (`VERCEL_TOKEN`): create at
  <https://vercel.com/account/tokens>. Scope it to the team you'll deploy under if
  you use Vercel Teams.
- **Resend API key** (optional, `resend_api_key`): from
  <https://resend.com/api-keys>. Without it the site works fine — lead **emails**
  are simply skipped until you set it (the lead still saves to the database and
  shows in the admin inbox).

> Generated secrets — the **database password** and the **webhook secret** — are
> returned in the tool output. **Record them.** Supabase cannot show the DB
> password again, and you'll want the webhook secret if you ever reconfigure the
> function by hand.

---

## 3. Collect the client brief

Have these ready before you run anything:

**Required**
- Brand name (e.g. `Acme Motors`)
- Phone (any format — digits are extracted for `tel:` links)
- Public contact email
- Street, city, state, ZIP
- Bare domain, no protocol (e.g. `example.com`)
- **Super-admin email** — the first person who can log into the admin portal.
  Until this row exists, *nobody* can log in (RLS is the whole access layer).

**Optional**
- `legal_suffix` (default `LLC`), `legal_name`, `tagline`, `founded_year`
- `facebook_url`
- `locations_json` — a JSON array of lots. Defaults to a single `main` lot. IDs
  must be lowercase / hyphen / underscore, no spaces:
  ```json
  [{"id":"main","label":"Main Lot"},{"id":"north","label":"North Lot"}]
  ```
- Email delivery: `resend_api_key`, `notification_to_emails` (comma-separated
  dealer inboxes), `notification_sender_email` (a verified Resend address),
  `notification_brand_name`
- Infra: `region` (default `us-east-1`), `organization_slug` (only if your
  Supabase account has more than one org), Vercel `team_id`

---

## 4. Path A — one-shot stand-up (recommended)

`standup_dealership_pro` runs the whole pipeline:
**scaffold → provision Supabase → deploy function → deploy Vercel → verify.**

Ask your agent to run it, e.g.:

> "Stand up a Pro dealership at `/Users/me/sites/acme-motors` for Acme Motors,
> phone 555-555-0100, email sales@example.com, 123 Main St, Springfield,
> ST 00000, domain example.com, super admin boss@example.com. Resend
> key `re_…`, notify sales@example.com."

Which calls `standup_dealership_pro` with:

| Argument | Value |
|---|---|
| `target_path` | `/Users/me/sites/acme-motors` (must be **outside** this repo) |
| `brand_name` | `Acme Motors` |
| `contact_phone` | `5555550100` |
| `contact_email` | `sales@example.com` |
| `address_street` / `_city` / `_state` / `_zip` | `123 Main St` / `Springfield` / `ST` / `00000` |
| `domain` | `example.com` |
| `super_admin_email` | `boss@example.com` |
| `resend_api_key` | `re_…` (optional) |
| `notification_to_emails` | `sales@example.com` (optional) |
| `region`, `organization_slug`, `team_id`, `locations_json`, … | as needed |

Tokens come from the server env (Section 2.2). If you didn't set them there, pass
`supabase_access_token` and `vercel_token`.

**On success** you get each step's result plus a `summary`:

```json
{
  "status": "success",
  "summary": {
    "site_url": "https://acme-motors.vercel.app",
    "supabase_ref": "abcdefgh...",
    "db_password": "…RECORD THIS…",
    "webhook_secret": "…RECORD THIS…"
  }
}
```

If `run_verify` is on (default) and the RLS suite fails, the pipeline stops and
returns `status: "verify_failed"` with the suite output — nothing is declared
done until the security gate is green. Then continue with the manual steps in
Section 7.

> **The moment of truth is the schema apply** inside provisioning. This is the
> first time `0001_initial_schema.sql` is applied to a brand-new cloud project. It
> has been validated against a real Postgres locally, but if anything is off the
> tool surfaces the Postgres error verbatim — read it, don't guess.

---

## 5. Path B — step by step (control & debugging)

Run the tools individually when you want to inspect between steps, retry one
stage, or provision infra separately from deploying. Order matters; each feeds
the next.

### 5.1 `scaffold_dealership_pro`
Copies the template to `target_path` (**outside the repo**; excludes
`node_modules`/`.next`/`.git`/env files) and generates `src/config/site.ts` from
the brief. No infrastructure touched. Pass `force: true` to overwrite a non-empty
target. You normally leave the Supabase fields blank here and let provisioning
write `.env.local`.
→ returns `target_path`, `site_config`, `env_local`.

### 5.2 `provision_supabase_dealership_pro`
The heavy step. Creates the Supabase project (or reuses `existing_ref`), waits
until it's healthy, then over the Management API:
1. fetches the project URL + browser (anon/publishable) key,
2. applies `0001_initial_schema.sql` (skipped if already applied),
3. seeds `super_admin_email` into `authorized_admins`,
4. sets the three **Vault** secrets (`project_url`, `project_anon_key`,
   `send_credit_app_notification_secret`),
5. sets the **edge-function** secrets (`WEBHOOK_SECRET`, and — if provided —
   `RESEND_API_KEY`, `NOTIFICATION_TO_EMAILS`, `NOTIFICATION_SENDER_EMAIL`,
   `NOTIFICATION_BRAND_NAME`).

Key inputs: `project_name`, `super_admin_email`, optional `db_password` (generated
if omitted), `region`, `organization_slug`, `resend_api_key` + notification
fields, and `target_path` (to also write `.env.local`).
→ returns `ref`, `project_url`, `anon_key`, **`db_password`**, `supabase_db_url`
(a Session Pooler URI for `psql`), **`webhook_secret`**, and `dashboard`.
**Record `db_password` and `webhook_secret`.**

> The **same** `webhook_secret` is used for both the Vault secret the DB trigger
> sends and the function's `WEBHOOK_SECRET` — the automation keeps them in sync so
> notifications can't fail on a mismatch.

### 5.3 `deploy_function_dealership_pro`
Deploys `send-credit-app-notification` via the Management API (Supabase bundles it
server-side). Inputs: `ref` (from 5.2). `verify_jwt` defaults to **False** on
purpose — see the note in Section 10. The database "webhook" is the
`AFTER INSERT` trigger already built by the schema, so nothing else needs wiring.
→ returns the function `endpoint`.

### 5.4 `deploy_vercel_dealership_pro`
Creates (or reuses) the Vercel project, wires `NEXT_PUBLIC_SUPABASE_URL` +
`NEXT_PUBLIC_SUPABASE_ANON_KEY` as env vars, writes `.vercel/project.json`, and
deploys with the `vercel` CLI (cloud build). Inputs: `target_path`,
`supabase_url` + `supabase_anon_key` (from 5.2), optional `project_name`,
`team_id`.
→ returns the live `url`.

### 5.5 `verify_dealership_pro`
Runs `supabase/tests/rls_regression.sh` against the project as the security gate.
Seeds two throwaway `@…invalid` admin identities, runs the suite, then removes
**only the rows it inserted**. Provide `ref` + `target_path`, and either
`supabase_db_url` or `db_password` (it builds the pooler URI for you). Needs
`psql` + `bash`.
→ returns `status` (`pass`/`fail`), `passed`, `failed`, and the suite `output`.
A clean run is **27/27**.

---

## 6. After the tools finish — manual steps

The automation gets you a working site at `*.vercel.app`. These last-mile items
are deliberately manual (they touch registrars, third-party domain verification,
or human logins).

### 6.1 Point the custom domain
1. In Vercel → the project → **Settings → Domains**, add `www.<domain>` (and the
   apex).
2. At the client's registrar, add the DNS records Vercel shows (usually a CNAME to
   `cname.vercel-dns.com` for `www`, and an A/ALIAS for the apex).
3. **If the domain is on Cloudflare, set the records to "DNS only" (grey cloud).**
   Vercel's automatic Let's Encrypt SSL fails behind Cloudflare's orange-cloud
   proxy. Verify real routing with `dig @8.8.8.8 <domain>` / `curl -I`, not just
   Vercel's green checkmarks.

### 6.2 Verify the Resend sending domain
Resend won't send from an address on an unverified domain. Either verify the
client's domain in Resend and set `notification_sender_email` to an address on it,
or, for a quick test, use Resend's sandbox sender `onboarding@resend.dev` and send
to your own developer inbox. If you skipped Resend entirely, leads still save and
appear in the admin inbox — set the key later to turn on email.

### 6.3 First admin login
Send the client to `https://<site>/admin`. They enter the `super_admin_email` you
seeded, receive an OTP by email, and they're in. (Supabase Auth OTP email works
out of the box; a custom SMTP sender is optional.)

### 6.4 Enter inventory
Inventory is entered by hand in the admin portal (Inventory tab) — add vehicles,
upload photos. There is no DMS sync by design.

---

## 7. The security gate — what `verify` proves

`rls_regression.sh` asserts what each policy is *supposed* to allow, for every
identity that matters — anonymous visitor, self-registered stranger, ordinary
admin, super admin — plus the storage bucket rules and the structural invariants
(exactly three wide-open policies; RLS on every table; no `TO public` ALL-command
policy). It simulates identities in rolled-back transactions and **writes
nothing**, so it's safe against production. Run it after **any** later change
under `supabase/`. A green run is 27 assertions passing.

---

## 8. Re-runs, idempotency & recovery

- **Provisioning is idempotent.** The schema is applied at most once (gated by the
  `authorized_admins` marker). Re-running with `existing_ref=<ref>` re-seeds the
  admin and re-sets secrets without touching the schema, and **reuses** the
  existing webhook secret instead of rotating it.
- **A failure after the project is created preserves the `ref`.** If a step blows
  up mid-provision, the error names the `ref` and tells you to re-run with
  `existing_ref=<ref>` — so you never orphan a paid project or create a duplicate.
- **There is no `force_reapply`.** The baseline is a one-shot "apply to an empty
  project" script (plain `CREATE`s), not idempotent DDL. To start clean, delete
  the project and create a fresh one.
- **`scaffold` won't overwrite** a non-empty target unless you pass `force: true`,
  and it refuses any `target_path` inside this repo.

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Missing required value: Supabase access token` | no `SUPABASE_ACCESS_TOKEN` in env and none passed | set it in the server env (2.2) or pass `access_token` |
| `Multiple (or zero) organizations found; pass organization_slug` | your account has >1 Supabase org | pass `organization_slug` |
| Project create 4xx about plan/limits | free-tier project cap reached for the org | remove an unused project, or pass `plan`/`instance_size` as your account allows |
| Schema apply returns a Postgres error | genuine SQL/privilege issue on the fresh project | read the verbatim error; the apply is atomic, so nothing half-applied — fix and re-run with `existing_ref` |
| Admin portal login form appears but nobody can act; site reads "permission denied" | first super admin not seeded, or grants missing | provisioning seeds the admin + the schema grants `anon`/`authenticated`; if you applied SQL by hand, ensure both |
| Leads save but **no emails** | Resend key/sender not set, or sending domain unverified | set `resend_api_key` + a verified `notification_sender_email` (6.2) |
| Emails still silent on a **new** project | function deployed with gateway JWT check against a non-JWT publishable key | keep `verify_jwt=False` (the default); the `X-Webhook-Secret` check is the real gate |
| `vercel` CLI "not found" | CLI not installed on the host | `npm i -g vercel`, or create the project + env via REST and deploy from a git push |
| Custom domain 404s but `*.vercel.app` works | Cloudflare orange-cloud / wrong branch/root / deployment protection | set DNS to grey-cloud; check the domain's branch + root in Vercel; disable SSO/password protection |
| `psql`/pooler connection refused from `verify` | IPv6 direct host, or missing `psql` | the tool uses the IPv4 **Session Pooler** URI automatically; ensure `psql` is on PATH |
| `EHOSTUNREACH … :5432` connecting by hand | you used the direct `db.<ref>.supabase.co` host (IPv6-only) | use the Session Pooler URI (`…pooler.supabase.com`) — what the tool returns as `supabase_db_url` |

---

## 10. What's *not* automated / accepted risks

Cross-reference [`corrupt-dealership-pro/README.md`](../corrupt-dealership-pro/README.md)
("Security model", "Accepted risks") — the important ones:

- **RLS is the entire access-control layer.** The browser uses only the anon /
  publishable key; there is no server API. Never add the `service_role` key to the
  app.
- **`verify_jwt=False` on the edge function is deliberate.** The only caller is the
  DB trigger, which sends the project's browser key; on projects created since
  Nov 2025 that's a *publishable* key (not a JWT), so a gateway JWT check would
  401 the trigger's fire-and-forget call and silently kill lead emails. The
  function authenticates itself with a fail-closed `X-Webhook-Secret` check.
- **No rate limiting** on the public lead/error inserts (honeypots only). Both
  forms are public by design.
- **`is_email_authorized` is anon-callable** (an admin-email oracle) — required,
  since it runs before login; knowing an address is an admin grants nothing.

---

## 11. Teardown

To retire a stand-up, the operator deletes the pieces (these are destructive and
are **your** action, not the tool's):

- **Supabase:** Dashboard → the project → Settings → General → *Delete project*.
- **Vercel:** the project → Settings → *Delete Project*.
- **DNS:** remove the records you added at the registrar.
- The generated site folder under `target_path` is just files — delete it.

---

## 12. Tool cheat-sheet

| Tool | Does | Needs |
|---|---|---|
| `scaffold_dealership_pro` | copy template + generate `site.ts` | brief; `target_path` outside the repo |
| `provision_supabase_dealership_pro` | create project, apply schema, seed admin, set secrets | `SUPABASE_ACCESS_TOKEN`; `super_admin_email` |
| `deploy_function_dealership_pro` | deploy the lead-notification edge function | `SUPABASE_ACCESS_TOKEN`; `ref` |
| `deploy_vercel_dealership_pro` | create Vercel project + env, deploy | `VERCEL_TOKEN`; `vercel` CLI; `target_path`; Supabase URL + key |
| `verify_dealership_pro` | run the RLS security gate | `psql`+`bash`; `ref` + (`db_password` or `supabase_db_url`) |
| `standup_dealership_pro` | all of the above, one call | both tokens; the full brief |

Record from the output: **site URL**, **Supabase `ref`**, **`db_password`**,
**`webhook_secret`**.
