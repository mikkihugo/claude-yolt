#!/bin/bash
# claude-yolt global installation script

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$HOME/.local/bin"
CLAUDE_YOLT_HOME="$HOME/.claude-yolt"

echo "🚀 Installing claude-yolt..."

# Create directories
mkdir -p "$INSTALL_DIR"
mkdir -p "$CLAUDE_YOLT_HOME"

# Install dependencies
echo "📦 Installing dependencies..."
cd "$SCRIPT_DIR"
npm install --production

# Make bin files executable
chmod +x "$SCRIPT_DIR/bin/claude-yolt"

# Create wrapper script
cat > "$INSTALL_DIR/claude-yolt" << 'EOF'
#!/usr/bin/env node
// claude-yolt global wrapper

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Find claude-yolt installation
const possiblePaths = [
  path.join(process.env.HOME, 'code/claude-yolt'),
  path.join(process.env.HOME, '.claude-yolt/installation'),
  path.join(process.env.HOME, 'claude-yolt'),
  '/usr/local/lib/node_modules/claude-yolt',
  path.join(process.env.HOME, '.npm/lib/node_modules/claude-yolt')
];

let claudeYoltPath = null;
for (const p of possiblePaths) {
  if (fs.existsSync(path.join(p, 'bin/claude-yolt'))) {
    claudeYoltPath = p;
    break;
  }
}

if (!claudeYoltPath) {
  console.error('❌ Could not find claude-yolt installation');
  console.error('Please reinstall from: https://github.com/mikkihugo/claude-yolt');
  process.exit(1);
}

// Run the actual claude-yolt
const child = spawn('node', [
  path.join(claudeYoltPath, 'bin/claude-yolt'),
  ...process.argv.slice(2)
], {
  stdio: 'inherit',
  env: {
    ...process.env,
    CLAUDE_YOLT_HOME: claudeYoltPath
  }
});

child.on('exit', (code) => process.exit(code || 0));
child.on('error', (err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
EOF

# Make wrapper executable
chmod +x "$INSTALL_DIR/claude-yolt"

# Create uninstall script
cat > "$CLAUDE_YOLT_HOME/uninstall.sh" << 'EOF'
#!/bin/bash
echo "🗑️  Uninstalling claude-yolt..."
rm -f "$HOME/.local/bin/claude-yolt"
rm -rf "$HOME/.claude-yolt"
echo "✅ Uninstalled claude-yolt"
EOF
chmod +x "$CLAUDE_YOLT_HOME/uninstall.sh"

# Save installation info
cat > "$CLAUDE_YOLT_HOME/installation.json" << EOF
{
  "version": "$(node -p "require('./package.json').version")",
  "installPath": "$SCRIPT_DIR",
  "installedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF

# Try to install Claude CLI if not present
if ! command -v claude &> /dev/null; then
  echo "📦 Installing Claude CLI..."
  npm install -g @anthropic-ai/claude-code || true
fi

# Check if ~/.local/bin is in PATH
if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
  echo ""
  echo "⚠️  Add $HOME/.local/bin to your PATH:"
  echo ""
  echo "  echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.bashrc"
  echo "  source ~/.bashrc"
  echo ""
fi

echo "✅ claude-yolt installed successfully!"
echo ""
echo "Usage: claude-yolt [prompt]"
echo ""
echo "To uninstall: $CLAUDE_YOLT_HOME/uninstall.sh"