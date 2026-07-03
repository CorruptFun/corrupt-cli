# CorruptCLI MCP Server

This directory contains the Model Context Protocol (MCP) server for the Corrupt Solutions SaaS Engine. It allows AI agents (like Claude Desktop, Cursor, or Hermes) to autonomously scaffold B2B websites and SaaS platforms without human terminal prompts.

## Tools Exposed
- `scaffold_inventory_site`: Builds the static Next.js Dealership/Mechanic inventory engine.
- `scaffold_saas_platform`: Builds the Next.js + Supabase membership/booking platform with liability waivers and Resend integrations.

## How to use with Claude Desktop
Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "corrupt-engine": {
      "command": "/Users/gravity/.hermes/hermes-agent/venv/bin/python",
      "args": [
        "/Users/gravity/Documents/corrupt-mcp/server.py"
      ]
    }
  }
}
```

## How to use with Cursor
Go to Settings > Features > MCP.
Add a new stdio server:
- **Name:** `corrupt-engine`
- **Command:** `/Users/gravity/.hermes/hermes-agent/venv/bin/python /Users/gravity/Documents/corrupt-mcp/server.py`