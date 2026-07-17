#!/usr/bin/env bash
set -euo pipefail

echo "💠 Installing Corrupt Solutions Factory..."

# Resolve the factory root from this script's location, not the caller's cwd.
FACTORY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- Prerequisites ----------------------------------------------------------
if ! command -v python3 >/dev/null 2>&1; then
    echo "❌ python3 not found. Install Python 3 and re-run." >&2
    exit 1
fi

PY_VER="$(python3 -c 'import sys; print("%d.%d" % sys.version_info[:2])')"
echo "→ Using Python $PY_VER"

# --- Core dependency (required) ---------------------------------------------
# The CLI needs `rich`. If this can't be installed the tool won't run, so this
# one is allowed to abort the install.
echo "→ Installing core dependency (rich)..."
if ! python3 -m pip install -r "$FACTORY_DIR/requirements.txt" --quiet 2>/dev/null; then
    echo "  retrying with --user..."
    if ! python3 -m pip install -r "$FACTORY_DIR/requirements.txt" --user --quiet; then
        echo "❌ Could not install 'rich', which the CLI requires." >&2
        echo "   Try:  python3 -m pip install --upgrade pip  then re-run ./install.sh" >&2
        exit 1
    fi
fi
echo "  ✅ core ready"

# --- Optional extras (best-effort) ------------------------------------------
# The MCP server (mcp, needs Python 3.10+) and the SaaS validator (requests).
# A failure here must NOT block the core CLI, so we never let it abort.
echo "→ Installing optional extras (MCP server, SaaS validator)..."
if python3 -m pip install -r "$FACTORY_DIR/requirements-optional.txt" --quiet 2>/dev/null \
   || python3 -m pip install -r "$FACTORY_DIR/requirements-optional.txt" --user --quiet 2>/dev/null; then
    echo "  ✅ optional extras installed"
else
    echo "  ⚠️  optional extras not installed (the CLI still works fully)."
    # mcp requires 3.10+; call that out specifically since it's the usual cause.
    if [ "$(printf '%s\n3.10\n' "$PY_VER" | sort -V | head -1)" != "3.10" ]; then
        echo "     The MCP server needs Python 3.10+ (you have $PY_VER)."
        echo "     Install it later under a newer Python:  pip install -r requirements-optional.txt"
    fi
fi

# --- Executables ------------------------------------------------------------
chmod +x "$FACTORY_DIR/bin/corrupt"
chmod +x "$FACTORY_DIR/corrupt-dealership-engine/corrupt-cli"

# --- Symlink onto PATH ------------------------------------------------------
if [ -d "$HOME/.local/bin" ]; then
    TARGET="$HOME/.local/bin/corrupt"
    ln -sf "$FACTORY_DIR/bin/corrupt" "$TARGET"
    echo "✅ Linked corrupt → $TARGET"
    case ":$PATH:" in
        *":$HOME/.local/bin:"*) ;;
        *) echo "⚠️  $HOME/.local/bin is not on your PATH. Add this to your shell profile:"
           echo "     export PATH=\"\$HOME/.local/bin:\$PATH\"" ;;
    esac
else
    TARGET="/usr/local/bin/corrupt"
    echo "→ $HOME/.local/bin not found; linking to $TARGET (may prompt for sudo)"
    sudo ln -sf "$FACTORY_DIR/bin/corrupt" "$TARGET"
    echo "✅ Linked corrupt → $TARGET"
fi

echo "✅ Installation complete. Type 'corrupt' to launch."
