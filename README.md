```
☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️
⚠️                    EXTREME DANGER                     ⚠️
⚠️         THIS SOFTWARE BYPASSES ALL SECURITY          ⚠️
⚠️              FOR TESTING ONLY - NOT SAFE             ⚠️
☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️☠️
```

# ☠️⚠️☠️ DANGER: claude-yolt - EXPERIMENTAL SECURITY BYPASS TOOL ☠️⚠️☠️

## 🚨 CRITICAL SECURITY WARNING 🚨

**THIS SOFTWARE IS DANGEROUS AND NOT FOR PRODUCTION USE**

### ☠️ DO NOT USE THIS SOFTWARE IF:
- You have production data on your system
- You are on a shared/multi-user system
- You have sensitive information accessible
- You are connected to the internet
- You care about system stability

### ☠️💀 THIS SOFTWARE WILL:
- **BYPASS ALL SECURITY CHECKS** in Claude Code
- **DISABLE PERMISSION PROMPTS** without your consent
- **MODIFY SYSTEM BEHAVIOR** in unpredictable ways
- **POTENTIALLY CRASH YOUR SYSTEM** with process explosions
- **CAUSE DATA LOSS** if processes are killed

### ✅ ONLY USE IN:
- Isolated, airgapped test environments
- Throwaway VMs that can be destroyed
- Systems with no important data
- Environments where security doesn't matter

**☠️ YOU HAVE BEEN WARNED. USE AT YOUR OWN RISK. ☠️**

---

## What This Is

**claude-yolt** is an experimental proof-of-concept created to demonstrate critical bugs in Claude Code's process management. It is **NOT** a production tool.

This tool exists solely to:
1. Demonstrate the process explosion bug (Anthropic Claude Code #1970)
2. Test potential workarounds in isolated environments
3. Show why Claude Code is unsafe for production use

## 🚫 SECURITY BYPASS WARNING

This tool **COMPLETELY BYPASSES** Claude's security model:
- No permission prompts
- No safety checks
- No user consent required
- Automatic approval of all operations

**This is equivalent to running everything as root with no password.**

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

## ⚠️ Installation (AT YOUR OWN RISK)

**ONLY INSTALL IN ISOLATED TEST ENVIRONMENTS:**

```bash
# DANGER: This will compromise your system security
# ONLY for testing in airgapped, isolated environments
npm install -g claude-yolt

# Safer: Run in isolated container
docker run --rm -it node:20 bash
# Then install inside container only
```

**DO NOT INSTALL ON:**
- Production systems
- Development machines with access to production
- Systems with sensitive data
- Your personal computer

## ⚠️ What claude-yolt Does (TESTING ONLY)

- **Bypasses all permission checks** (no security prompts)
- **Auto-updates Claude CLI** when needed
- **Process limits**: Max 200 concurrent (queues extras)
- **Resource limits**: 4GB RAM, 30min CPU time
- **Hang prevention**: Kills 0% CPU processes after 10s
- **Stream handling**: Prevents pipe buffer deadlock

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



## Process Control Features

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
- [claude-yolo](https://github.com/eastlondoner/claude-yolo) by [eastlondoner (Andrew Jefferson)](https://github.com/eastlondoner) - The original YOLO mode implementation that inspired this project
- [claude-safer](https://github.com/mikkihugo/claude-safer) by mikkihugo
- [claude-safer-rs](https://github.com/mikkihugo/claude-safer-rs) by mikkihugo

🙏 **Special thanks to [eastlondoner (Andrew Jefferson)](https://github.com/eastlondoner)** for creating the original [claude-yolo](https://github.com/eastlondoner/claude-yolo) tool that pioneered the concept of bypassing Claude's permission system. This project (claude-yolt) extends that brilliant idea with critical process management fixes for Claude Code's stability issues.

The name "yolt" is a homage to the original "yolo" - because sometimes you just need to make things work! 🚀

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

## ⚠️ Legal Disclaimer

**DISCLAIMER OF ALL WARRANTIES AND LIABILITY**

THIS SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY ARISING FROM THE USE OF THIS SOFTWARE.

BY USING THIS SOFTWARE, YOU ACKNOWLEDGE THAT:
1. You understand this is experimental, dangerous software
2. You accept all risks of data loss, system instability, and security breaches
3. You will not use this in production or on systems with sensitive data
4. You will not hold the authors liable for any damages
5. You are using this solely for testing bugs in isolated environments

This software is **NOT**:
- Endorsed by Anthropic
- Safe for production use
- A legitimate security tool
- Intended for real work

## Emergency Recovery

When (not if) this tool causes problems:

```bash
# Kill all spawned processes
pkill -f '(fd|rg|cargo|rustc|claude)'

# Check for runaway processes
ps aux | grep -E '(claude|cargo|fd|rg)' | wc -l

# Nuclear option - reboot
sudo reboot
```

## CI/CD Features

This project includes GitHub Actions workflows that can use AI for:
- Code review and analysis
- Security vulnerability detection  
- Performance optimization suggestions
- Bug hunting

**No API key required!** Workflows will use:
1. Free models (Gemini Flash via aider)
2. OpenRouter (if `OPENROUTER_API_KEY` secret is set)
3. Static analysis tools as fallback

## License

MIT - But seriously, this is a bug demonstration tool. Do not use in production.# Testing AI linting workflow
