#!/usr/bin/env bash
set -e
echo "💠 Installing Corrupt Solutions Factory..."

FACTORY_DIR=\$PWD

# Make executables runnable
chmod +x "\$FACTORY_DIR/bin/corrupt"
chmod +x "\$FACTORY_DIR/corrupt-dealership-engine/corrupt-cli"

# Symlink to /usr/local/bin (requires sudo) or ~/.local/bin
if [ -d "\$HOME/.local/bin" ]; then
    ln -sf "\$FACTORY_DIR/bin/corrupt" "\$HOME/.local/bin/corrupt"
    echo "Symlinked corrupt CLI to ~/.local/bin/corrupt"
else
    sudo ln -sf "\$FACTORY_DIR/bin/corrupt" "/usr/local/bin/corrupt"
    echo "Symlinked corrupt CLI to /usr/local/bin/corrupt"
fi

echo "✅ Installation complete. Type 'corrupt' to launch."
