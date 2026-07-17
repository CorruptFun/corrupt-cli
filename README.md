# 💠 Corrupt CLI - Master Infrastructure Engine

![Corrupt Solutions](https://placehold.co/1200x400/ffffff/000000?text=CORRUPT+SOLUTIONS+CLI)

The **Corrupt CLI** is a zero-configuration scaffolding engine and Model Context Protocol (MCP) server. It instantly generates production-ready, white-labeled web architectures for local businesses and SaaS platforms.

Built by [Corrupt Solutions](https://corrupt.solutions).

## 🚀 The generators

Three white-label site generators. Full detail + a "which one do I pick?" guide in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

**Dealership / Local Service — two tiers:**

1. **Simple — `corrupt-dealership-engine/`**
   - **Stack:** static HTML/JS/Tailwind + Python build. No backend.
   - **What:** a fast brochure site with real lead capture. Edit a JSON, re-render,
     drop `dist/` on any static host. Cheapest and fastest to ship.

2. **Pro — `corrupt-dealership-pro/`**
   - **Stack:** Next.js + Supabase (Postgres/RLS, Auth, Storage, Edge Functions).
   - **What:** the static site *plus* a real, RLS-secured admin portal — OTP login,
     database inventory with photo uploads, credit-application inbox. Configured by
     editing one config file + `.env` (no token replacement).

**Membership / Booking SaaS — `CorruptCLI-Engine/`**
   - **Target:** Gyms, Salons, Clubs, member-based orgs.
   - **Stack:** Next.js + Supabase + Deno Edge Functions; Stripe billing, scheduling,
     RLS, optional liability waivers.

> `engine` vs `pro`: the Simple tier has **no backend** (static, edit-JSON-and-render);
> the Pro tier is a **full app** with a real admin and a database. Pick Simple for
> speed and zero infrastructure, Pro for a live admin and DB-backed inventory. See
> [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## 💻 Human Installation

Run the following commands to install the CLI globally on your machine:

```bash
git clone https://github.com/CorruptFun/corrupt-cli.git
cd corrupt-cli
./install.sh
```

**Usage:**
Type `corrupt` in your terminal to launch the interactive selector.

---

## 🤖 AI Agent Installation (MCP Server)

This repository includes a native FastMCP server, allowing AI agents (Claude, Cursor, Hermes) to autonomously scaffold these architectures for you.

Add the following to your agent's `config.yaml` or MCP configuration:

```json
{
  "mcpServers": {
    "corrupt-cli": {
      "command": "python3",
      "args": ["/path/to/corrupt-cli/corrupt-mcp/server.py"]
    }
  }
}
```

**Available MCP Tools:**
- `scaffold_inventory_site`: Generates the Dealership/Local Service stack.
- `scaffold_saas_platform`: Generates the Supabase/Next.js Membership stack.

---

## 📜 License & Usage

Created for the community by Corrupt Solutions. 
