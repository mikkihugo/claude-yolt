# claude-yolt 🎯

Unified Claude CLI wrapper combining the best of three projects:
- **YOLO mode** from claude-yolo (bypass permissions)
- **Safety features** from claude-safer (resource limits)
- **Intelligent routing** from claude-safer-rs (cost optimization)

## ⚠️ Safety Warning

On first run, claude-yolt displays a safety warning about bypassing Claude's security features. You have 10 seconds to respond, or it proceeds automatically. This warning appears only once.

## 🐢 Process Limiting & Hang Prevention

claude-yolt fixes Claude CLI's process issues:

### Why Processes Hang in Claude:
1. **No stream draining**: Processes fill stdout/stderr buffers and deadlock
2. **Zombie processes**: Exit status not collected, processes stay in zombie state
3. **No stdin closure**: Processes wait forever for input that never comes
4. **Missing signal handling**: Child processes not cleaned up on parent exit

### Our Fixes:
- **Soft queueing** at 200 processes (no hard failures - just waits)
- **No ulimit -u** (would cause "Resource temporarily unavailable" errors)
- Automatic stream draining to prevent buffer deadlock (fixes #1970)
- Proper stdin/stdout/stderr handling
- Fast hang detection: fd >10s, rg >15s with <5% CPU = killed
- Process interceptor patches child_process module directly
- Search tools (`fd`/`rg`) limited to single thread + result limits

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

### Primary Command: claude-yolt

`claude-yolt` is a drop-in replacement for `claude-code` that mirrors all Claude Code behavior:

```bash
# If prompt provided, executes it
claude-yolt "fix this code"

# If no arguments, opens Claude's interactive UI
claude-yolt

# Supports all Claude CLI flags
claude-yolt --help
claude-yolt --version
claude-yolt --model claude-3-opus-20240229
claude-yolt --output result.txt "analyze this"

# Everything works just like claude, but with:
# - Automatic permission bypass (no security prompts)
# - Safety limits (4GB RAM, CPU limits)
# - Auto-updates Claude CLI
```


### Additional Commands

```bash
# Pure YOLO mode (no safety limits)
claude-yolo "fix this code"

# Maximum safety mode
claude-airbag "analyze untrusted code"

# Smart routing to save money
claude-router "format this file"

# Wrap any command with safety limits
claude-seatbelt npm test

# Interactive UI (similar to claude with no args)
claude-yolt-ui

# Unified command with mode selection
cyolt --yolo "no limits"
cyolt --safe "maximum safety"
cyolt --router "smart routing"
```

## Safety Comparison

| Mode | Permissions | CPU Limit | Memory | Max Processes | Cargo Jobs |
|------|------------|-----------|---------|---------------|------------|
| claude-yolo | Bypassed | None | None | None | Unlimited |
| claude-yolt | Bypassed | 30 min | 4GB | 200 (queue) | 4 |
| claude-airbag | Bypassed | 5 min | 2GB | 20 | 1 |
| claude-router | Varies | Varies | Varies | Varies | Varies |

### Process Control Features

- **Smart queueing**: Never kills processes - queues them when limit reached
- **Process interception**: Patches Claude's child_process module directly
- **Rust explosion prevention**: Limits concurrent rust processes, queues extras
- **Search tool limiting**: Forces `fd` and `rg` to single-threaded mode
- **Cargo job control**: Forces `--jobs 4` flag on all cargo commands
- **Build tool limits**: Controls make, cmake, ninja parallelism via env vars
- **Emergency kill**: Kills fd/rg if >10 processes, cargo/rustc if >50
- **Transparent operation**: Claude CLI and commands work normally, just slower
- **Nice level**: All processes run at lower priority
- **No failures**: Commands wait in queue instead of failing

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

### Environment Variables

```bash
# Process limiting (soft queue, not hard limit)
export CLAUDE_MAX_PROCESSES=200  # Start queueing at this count (default: 200)
export CLAUDE_PROCESS_DELAY=25   # Delay between spawns in ms (default: 25)

# For extreme cases (system already overloaded)
export CLAUDE_MAX_PROCESSES=50   # Much lower limit
export CLAUDE_PROCESS_DELAY=100  # Slower spawning

# Example: More aggressive limiting for constrained systems
export CLAUDE_MAX_PROCESSES=100
export CLAUDE_PROCESS_DELAY=50
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

## Related Issues

- [Claude Code #1970](https://github.com/anthropics/claude-code/issues/1970) - Process explosion bug this wrapper fixes
- Prevents MaxListenersExceededWarning
- Prevents system hangs from fd/rg deadlocks
- Prevents memory exhaustion from process explosions

## Known Issues Fixed

### Process Explosions (GitHub Issue #1970)
claude-yolt fixes these Claude Code issues:

1. **Cargo/Rust builds**: Spawning 4000+ processes → Limited to 200 concurrent
2. **fd searches**: Multi-threaded fd killing systems → Forced single-threaded  
3. **rg (ripgrep)**: Similar threading issues → Limited to 1 thread
4. **Build parallelism**: Uncontrolled make -j → Limited to 4 jobs
5. **MaxListenersExceededWarning**: Too many abort listeners → Proper cleanup
6. **Pipe buffer deadlock**: Unread stdout fills up → Auto-draining streams

### UI Compatibility
- Login prompts work normally (just rate-limited)
- Interactive commands function correctly
- All Claude CLI features preserved

## License

MIT