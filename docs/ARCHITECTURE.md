# Architecture — what's in this repo and when to use each piece

The factory produces white-label websites for local businesses. It ships **three
site generators** plus the tooling that drives them. This document explains what
each one is, how it's used, and — importantly — **how the two dealership options
(`engine` vs `pro`) differ and when to pick which.**

---

## The three generators

| Directory | Product | Stack | Backend | How you configure it |
|---|---|---|---|---|
| `corrupt-dealership-engine/` | Dealership — **Simple** | Static HTML/JS/Tailwind, Python build | **None** | Interactive CLI / MCP fills a template from a config + inventory JSON |
| `corrupt-dealership-pro/` | Dealership — **Pro** | Next.js + Supabase | Postgres + RLS, Auth, Storage, Edge Functions | Config-**file** generation + full MCP stand-up (Supabase + Vercel) from API tokens |
| `CorruptCLI-Engine/` | Membership / Booking **SaaS** | Next.js + Supabase + Deno | Postgres + RLS, Stripe, Resend | `corrupt.py` / MCP copies the engine and replaces `{{TOKENS}}` |

---

## Dealership: `engine` vs `pro` — the important distinction

Both build a used-car dealership website. They are **different tiers for different
operators**, not versions of the same thing. Both are meant to ship.

### `corrupt-dealership-engine` — the Simple (static) tier

- **What it is:** a zero-backend static site generator. `render.py` fills
  `template.html` from a `config.json` + `inventory.json` and writes
  `dist/index.html`. That's the whole deliverable — one HTML file plus assets.
- **What it does:** a fast brochure site — hero, inventory cards, financing
  pitch, about, contact/map, and a **real lead-capture form** that POSTs to a
  configurable endpoint (Formspree/Web3Forms/any function) with a mail-client
  fallback so a lead is never silently dropped. Buy-Here-Pay-Here messaging is
  opt-in (`financing.bhph_enabled`) and uses compliance-safe wording.
- **Admin:** none. Inventory lives in `inventory.json`; to change it you edit the
  JSON and re-render. (There is deliberately no fake "admin portal.")
- **Deploy:** drop `dist/` on any static host — Netlify, Cloudflare Pages, Vercel,
  S3. No database, no accounts, no secrets.
- **Use it when:** the operator wants a cheap, fast, no-infrastructure site to sell
  a dealer this week. Nothing to stand up, nothing to maintain.
- **Trade-off:** no live admin, no database inventory, no photo uploads. Updates
  mean editing JSON and redeploying.

### `corrupt-dealership-pro` — the Pro (dynamic) tier

- **What it is:** a full Next.js 16 + Supabase application (distilled and
  de-branded from a real production dealership site).
- **What it does:** everything the static tier shows, **plus** a real,
  server-enforced admin portal: passwordless OTP login, database-backed inventory
  with per-vehicle photo uploads and multi-image galleries, a credit-application
  inbox with live notifications, error logging, and super-admin management of the
  admin allow-list.
- **Admin & security:** real. **RLS is the entire access-control layer** — the
  browser talks to Supabase with only the anon key, and every sensitive policy
  checks the caller's verified email against an `authorized_admins` table. The
  complete, secure schema is one file: `supabase/migrations/0001_initial_schema.sql`.
- **Configure it:** the MCP scaffolder **generates `src/config/site.ts`** from
  structured inputs (brand, contact, lot locations). No token replacement — it's
  a real config file in a normal app, not a string-substituted template. You can
  hand-edit it afterwards.
- **Deploy:** fully automated from API tokens via the MCP tools below — create
  the Supabase project, apply the schema, seed the first admin, set the Vault +
  edge-function secrets, deploy the edge function, create the Vercel project +
  env, deploy, and run the RLS regression suite as a security gate. (All still
  documented for a manual run in the migration and READMEs.)
- **Use it when:** the operator wants a real, maintainable platform with a live
  admin and database inventory, and is willing to stand up Supabase.
- **Trade-off:** more infrastructure and moving parts than the static tier.

**Stand-up automation (MCP).** `corrupt-mcp/` exposes the Pro tier as a set of
idempotent tools (backed by `corrupt-mcp/dealership_pro.py`): `scaffold_dealership_pro`
(copy + generate config), `provision_supabase_dealership_pro` (Management API:
create project → apply `0001_initial_schema.sql` → seed super admin → Vault +
function secrets), `deploy_function_dealership_pro`, `deploy_vercel_dealership_pro`,
`verify_dealership_pro` (runs `rls_regression.sh`), and `standup_dealership_pro`
(all of it in one call). Tokens (`SUPABASE_ACCESS_TOKEN`, `VERCEL_TOKEN`) come
from arguments or the environment and are never written to committed files;
generated secrets (DB password, webhook secret) are returned to the operator.
The full operator walkthrough is [`docs/PRO_STANDUP_GUIDE.md`](PRO_STANDUP_GUIDE.md).

### Picking one

```
Needs a live admin / DB inventory / photo uploads?  ── yes ──►  pro
                     │
                     no
                     ▼
Wants zero backend, cheapest + fastest to ship?     ──────────►  engine
```

> **Note on wiring:** the Simple tier is generated by the interactive CLI and the
> MCP `scaffold_inventory_site` tool. The **Pro tier is fully automated through the
> MCP server** (`scaffold_dealership_pro` … `standup_dealership_pro` — see the
> automation note above); it is not exposed in the interactive `corrupt` CLI menu,
> which stays focused on the zero-infrastructure Simple tier.

---

## The membership / booking SaaS: `CorruptCLI-Engine/`

A Next.js + Supabase + Deno platform for gyms, salons, studios, and other
member-based businesses — booking, memberships, Stripe billing, transactional
email, optional liability waivers. Scaffolded by `corrupt.py` or the MCP
`scaffold_saas_platform` tool (copies the engine, replaces `{{TOKENS}}`).

> ⚠️ This engine still needs a security remediation pass before it is used for a
> paying client (tracked separately). Treat it as a functional prototype until then.

---

## Supporting tooling

| Path | What it does |
|---|---|
| `bin/corrupt` | The interactive launcher (`corrupt`) — the menu that routes to a generator. |
| `bin/hunter.py` | Lead Hunter — finds local-business prospects via Google Places to pitch sites to. |
| `bin/telemetry.py` | Anonymous CLI usage telemetry. |
| `corrupt-mcp/server.py` | FastMCP server exposing the scaffolders + the Pro-tier stand-up tools to AI agents (logic in `corrupt-mcp/dealership_pro.py`). |
| `install.sh` / `requirements*.txt` | Installs the CLI (`rich`) and optional extras (`mcp`, `requests`). |

---

## At a glance

```
corrupt-factory-distribution/
├── bin/                       # corrupt launcher, Hunter, telemetry
├── corrupt-dealership-engine/ # Dealership — Simple (static HTML + Python)
├── corrupt-dealership-pro/    # Dealership — Pro (Next.js + Supabase)   ← config-driven
├── CorruptCLI-Engine/         # Membership/Booking SaaS (Next.js + Supabase + Deno)
├── corrupt-mcp/               # MCP server for AI-driven scaffolding
└── install.sh
```
