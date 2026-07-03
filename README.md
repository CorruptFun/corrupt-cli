# 💠 Corrupt CLI - Master Infrastructure Engine

![Corrupt Solutions](https://placehold.co/1200x400/ffffff/000000?text=CORRUPT+SOLUTIONS+CLI)

The **Corrupt CLI** is a zero-configuration scaffolding engine and Model Context Protocol (MCP) server. It instantly generates production-ready, white-labeled web architectures for local businesses and SaaS platforms.

Built by [Corrupt Solutions](https://corrupt.solutions).

## 🚀 Two Architectures, One Engine

1. **Local Service & Inventory (Static Engine)**
   - **Target:** Dealerships, Mechanics, HVAC, Local Services.
   - **Stack:** HTML/JS/Tailwind static generation + Python build pipeline.
   - **Features:** High-performance SEO, built-in dual-path credit applications, local inventory JSON sync, and extreme load speeds.

2. **SaaS Membership & Booking (Dynamic Engine)**
   - **Target:** Gyms, Salons, Clubs, Member-based orgs.
   - **Stack:** Next.js + Supabase + Deno Edge Functions.
   - **Features:** Stripe billing, automated scheduling, role-level security (RLS), digital liability waivers, and multi-tenant webhook architecture.

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
