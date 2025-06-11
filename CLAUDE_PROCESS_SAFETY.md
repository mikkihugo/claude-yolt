# CLAUDE.md - Process Safety Rules

## CRITICAL: Process Spawning Limits

### Maximum Concurrent Processes
- **NEVER** spawn more than 10 concurrent child processes
- **ALWAYS** wait for processes to complete before spawning new ones
- **USE** sequential execution for file operations

### Forbidden Patterns
```javascript
// ❌ NEVER DO THIS
for (const file of files) {
  spawn('fd', [file]);  // Creates N processes
}

// ✅ DO THIS INSTEAD  
for (const file of files) {
  await execSync(`fd ${file}`);  // One at a time
}
```

### Process-Heavy Commands - USE WITH CAUTION
1. **fd** - Limit with flags: `fd --max-results=100 --threads=1`
2. **rg/ripgrep** - Limit with flags: `rg --max-count=100 --threads=1`
3. **find** - Prefer over fd for simple searches
4. **cargo** - Always use `--jobs=2` flag
5. **make** - Always use `-j2` flag

### Safe Command Alternatives
- Instead of `fd .` use `find . -type f | head -1000`
- Instead of `rg pattern` use `grep -r pattern . | head -100`
- Instead of parallel execution, use sequential loops
- Instead of spawning shells, use Node.js built-ins when possible

### Resource Protection Rules
1. **Always consume stdout/stderr** to prevent pipe buffer deadlock:
   ```javascript
   const proc = spawn(cmd, args);
   proc.stdout.on('data', () => {});  // Drain even if not used
   proc.stderr.on('data', () => {});
   ```

2. **Set timeouts** on all spawned processes:
   ```javascript
   const proc = spawn(cmd, args, { timeout: 30000 });  // 30 second max
   ```

3. **Limit process scope**:
   - Don't search in node_modules
   - Don't search in .git directories  
   - Don't recurse more than 3 levels deep

### Emergency Commands
If system becomes unresponsive, user should run:
```bash
# Kill all fd/rg processes
pkill -f '(fd|rg|ripgrep)'

# Kill all cargo/rust processes
pkill -f '(cargo|rustc)'  

# See what Claude spawned
pgrep -f claude | xargs -r ps -p
```

### Process Monitoring
Before executing commands that might spawn many processes:
1. Check current process count
2. Warn user if > 50 processes already running
3. Refuse to execute if > 100 processes running

### Example Safe Implementation
```javascript
// Safe file search with process limit
async function safeFileSearch(pattern) {
  // Check current processes
  const processCount = (await exec('ps aux | wc -l')).stdout;
  if (parseInt(processCount) > 100) {
    console.error("Too many processes running, aborting");
    return;
  }
  
  // Use find with limits
  const { stdout } = await exec(
    `find . -name "${pattern}" -type f | head -100`,
    { timeout: 5000 }
  );
  
  return stdout.split('\n').filter(Boolean);
}
```

## REMEMBER: System stability > Task completion

If unsure whether a command will spawn many processes, ASK THE USER FIRST.