# claude-yolt 🎯

Unified Claude CLI wrapper combining the best of three projects:
- **YOLO mode** from claude-yolo (bypass permissions)
- **Safety features** from claude-safer (resource limits)
- **Intelligent routing** from claude-safer-rs (cost optimization)

## Installation

```bash
npm install -g claude-yolt
```

## Features

### 🚀 YOLO Mode (claude-yolo)
- Bypasses all permission checks
- Auto-updates Claude CLI
- Requires one-time consent

### 🛡️ Safety Modes (claude-yolt/claude-007)
- YOLO + resource limits
- CPU time limits (5-30 minutes)
- Memory limits (2-4GB)
- Process monitoring

### 🪂 Airbag Mode (claude-airbag)
- Strictest safety limits
- 2GB memory max
- 5 minute CPU time
- Ideal for untrusted code

### 🔧 Seatbelt Wrapper (claude-seatbelt)
- Wrap any command with safety limits
- Example: `claude-seatbelt cargo build`

### 🧠 Smart Router (claude-router)
- Routes to cheapest option:
  1. Local tools (lint, format)
  2. Free AI models (Ollama, GitHub Models)
  3. Claude CLI (complex tasks only)

## Usage

### Unified Command Interface

```bash
# Use default mode (configured in ~/.claude-yolt/config.json)
claude "fix this code"

# Specify mode with flags
claude --yolo "give me unlimited power"
claude --safe "analyze untrusted code"
claude --router "format this file"
claude -m yolt "build my project"

# Runtime limits
claude --memory 2048 --cpu 300 "run tests"

# Configure default mode
claude --set-default router
claude config set defaultMode yolt
claude config set safety.maxMemMB 8192

# Interactive UI mode
claude ui

# Start OpenAI-compatible API server
claude-api --port 3000
claude-api --key my-secret-key  # With authentication
```

### OpenAI-Compatible API

Start an API server that wraps Claude CLI with an OpenAI-compatible interface:

```bash
# Start server
claude-api

# With authentication
claude-api --key sk-my-secret-key
claude-api --set-key sk-my-secret-key  # Save to config

# Use with curl
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-my-secret-key" \
  -d '{
    "model": "claude-3-opus-20240229",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'

# Use with OpenAI Python SDK
from openai import OpenAI
client = OpenAI(
    api_key="sk-my-secret-key",
    base_url="http://localhost:3000/v1"
)

response = client.chat.completions.create(
    model="claude-router",  # Use router mode
    messages=[{"role": "user", "content": "Format this code"}]
)
```

Available models via API:
- `claude-3-opus-20240229` - Uses default mode
- `claude-yolo` - Pure YOLO mode
- `claude-safe` - Airbag mode
- `claude-router` - Smart routing mode
```

### Direct Commands (for backwards compatibility)

```bash
# Pure YOLO mode (no limits)
claude-yolo "fix this code"

# YOLO with safety (recommended)
claude-yolt "build my project"
claude-007 "run tests"

# Maximum safety
claude-airbag "analyze untrusted code"

# Wrap commands
claude-seatbelt npm test

# Smart routing (saves money)
claude-router "format this file"
```

## Safety Comparison

| Mode | Permissions | CPU Limit | Memory | Processes |
|------|------------|-----------|---------|-----------|
| claude-yolo | Bypassed | None | None | None |
| claude-yolt | Bypassed | 30 min | 4GB | Monitored |
| claude-airbag | Bypassed | 5 min | 2GB | Strict |
| claude-router | Varies | Varies | Varies | Varies |

## Configuration

Create `~/.claude-yolt/config.json`:

```json
{
  "defaultMode": "yolt",
  "router": {
    "preferLocal": true,
    "freeModels": ["ollama", "github"]
  },
  "limits": {
    "cpu": 1800,
    "memory": "4GB"
  }
}
```

## Architecture

```
claude-yolt/
├── bin/           # CLI entry points
├── lib/           # Core functionality
│   ├── yolo.js    # Permission bypass
│   ├── safety.js  # Resource limiting
│   └── router.js  # Task routing
├── rust/          # Rust implementation
└── test/          # Test suite
```

## Credits

Built on the shoulders of:
- [claude-yolo](https://github.com/eastlondoner/claude-yolo) by eastlondoner
- [claude-safer](https://github.com/mikkihugo/claude-safer) by mikkihugo
- [claude-safer-rs](https://github.com/mikkihugo/claude-safer-rs) by mikkihugo

## License

MIT