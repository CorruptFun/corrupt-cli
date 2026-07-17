# CorruptCLI MCP Server

This directory contains the Model Context Protocol (MCP) server for the Corrupt
factory. It lets AI agents (Claude Desktop, Cursor, etc.) scaffold sites
autonomously, without human terminal prompts.

## Tools exposed
- `scaffold_inventory_site`: Builds the static dealership/local-service site
  (the Simple tier — `corrupt-dealership-engine`).
- `scaffold_saas_platform`: Builds the Next.js + Supabase membership/booking
  platform (`CorruptCLI-Engine`) with optional liability waivers and email.

> The Pro dealership tier (`corrupt-dealership-pro`) is currently a
> clone-and-configure template and is not yet exposed as an MCP tool.

## Requirements
Install the optional `mcp` dependency (needs Python 3.10+):

```bash
pip3 install -r requirements-optional.txt   # from the repo root
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
