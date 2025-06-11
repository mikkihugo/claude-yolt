# Add this to your project's CLAUDE.md file

## Process Safety Rules

### CRITICAL: Prevent system overload
- Max 10 concurrent processes
- Sequential execution only  
- No parallel spawning

### Safe command usage:
```bash
# ❌ AVOID
fd .                    # Can spawn too many threads
rg pattern             # Can hang on large output
cargo build            # Can spawn 100+ processes

# ✅ USE INSTEAD  
find . -type f | head -1000     # Limited results
grep -r pattern . | head -100   # Limited output
cargo build --jobs=2            # Limited parallelism
```

### Required flags:
- `fd`: Always use `--threads=1 --max-results=1000`
- `rg`: Always use `--threads=1 --max-count=100`  
- `cargo`: Always use `--jobs=2`
- `make`: Always use `-j2`

### Before running commands:
1. Check if output will be large
2. Add result limits (head, --max-results)
3. Use timeouts for long operations
4. Prefer built-in Node.js methods over spawning

### If system hangs:
Tell user to run: `pkill -f '(fd|rg|cargo|rustc)'`