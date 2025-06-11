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