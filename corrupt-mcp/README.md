# CorruptCLI MCP Server

This directory contains the Model Context Protocol (MCP) server for the Corrupt
factory. It lets AI agents (Claude Desktop, Cursor, etc.) scaffold sites
autonomously, without human terminal prompts.

## Tools exposed

### Simple tier + SaaS
- `scaffold_inventory_site`: Builds the static dealership/local-service site
  (the Simple tier — `corrupt-dealership-engine`).
- `scaffold_saas_platform`: Builds the Next.js + Supabase membership/booking
  platform (`CorruptCLI-Engine`) with optional liability waivers and email.

### Pro dealership tier — full end-to-end stand-up

> **Operator walkthrough:** [`docs/PRO_STANDUP_GUIDE.md`](../docs/PRO_STANDUP_GUIDE.md)
> — prerequisites, tokens, the one-shot and step-by-step paths, post-deploy DNS/Resend
> steps, troubleshooting, and re-run/recovery. Start there to actually stand up a site.

The Pro tier (`corrupt-dealership-pro`, Next.js + Supabase) is a real app, so it
is *configured by generating a config file* and *stood up against live
infrastructure via API tokens*. Each tool is one idempotent step; the logic
lives in `dealership_pro.py`.

- `scaffold_dealership_pro`: Copy the template outside the repo (minus
  `node_modules`/`.next`/`.git`/env files) and generate `src/config/site.ts`
  from structured inputs (brand, contact, address, domain, `locations[]`).
- `provision_supabase_dealership_pro`: Supabase Management API — create the
  project, wait until healthy, apply `supabase/migrations/0001_initial_schema.sql`,
  seed the first super admin, and set the three Vault secrets + the edge-function
  secrets. The one webhook secret is shared automatically between the DB trigger
  and the edge function.
- `deploy_function_dealership_pro`: Deploy the `send-credit-app-notification`
  edge function (Supabase bundles it server-side — no local Deno/CLI needed).
- `deploy_vercel_dealership_pro`: Create the Vercel project, wire the two
  `NEXT_PUBLIC_SUPABASE_*` env vars, and deploy (needs the `vercel` CLI).
- `verify_dealership_pro`: Run `supabase/tests/rls_regression.sh` against the new
  project as a security gate (needs `psql` + `bash`).
- `standup_dealership_pro`: All of the above in one call:
  scaffold → provision → deploy function → deploy Vercel → verify.

**Tokens** are read from arguments or the environment and are never written into
committed files:
- `SUPABASE_ACCESS_TOKEN` — a Supabase **personal access token** (starts with
  `sbp_`). A project key (`sb_secret_…`) will not work for the Management API.
- `VERCEL_TOKEN` — a Vercel token (create at `https://vercel.com/account/tokens`).

Generated secrets (the database password, the webhook shared secret) are
**returned in the tool output** — record them; Supabase cannot show them again.

**Host prerequisites for the deploy/verify steps:** the `vercel` CLI on `PATH`
(`npm i -g vercel`) for the Vercel deploy, and `psql` + `bash` for the RLS
regression gate. Provisioning and the edge-function deploy are pure REST and need
neither the Supabase CLI nor Docker.

## Requirements
Install the optional `mcp` and `requests` dependencies (needs Python 3.10+):

```bash
pip3 install -r requirements-optional.txt   # from the repo root
```

`requests` powers the Pro-tier Supabase/Vercel API calls; `mcp` runs the server.

## Tests

Offline tests (no network, no tokens) cover the Pro-tier logic — unit tests with
a mocked `requests.Session`, plus integration tests that run the real HTTP code
paths (multipart function deploy, the project-status polling loop, `.env.local`
generation, the Vercel create + CLI deploy) against a local mock of the Supabase
Management API + Vercel REST API:

```bash
python3 -m unittest discover -s corrupt-mcp/tests
```

## How to use with Claude Desktop
Add this to your `claude_desktop_config.json`, using the absolute path to your
checkout of this repo:

```json
{
  "mcpServers": {
    "corrupt-engine": {
      "command": "python3",
      "args": [
        "/path/to/corrupt-cli/corrupt-mcp/server.py"
      ]
    }
  }
}
```

If `mcp` is installed in a virtualenv, point `command` at that env's `python`
instead of the system `python3`.

## How to use with Cursor
Go to Settings > Features > MCP and add a new stdio server:
- **Name:** `corrupt-engine`
- **Command:** `python3 /path/to/corrupt-cli/corrupt-mcp/server.py`
