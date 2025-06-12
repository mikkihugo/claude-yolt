# Authentication for claude-yolt in CI/CD

Since claude-yolt bypasses Claude's permission system, it can work in CI/CD with various authentication methods:

## Option 1: Session Key (Recommended)

1. Login to Claude locally: `claude login`
2. Get your session key from `~/.config/@anthropic-ai/claude-code/config.json`
3. Add to GitHub Secrets: `CLAUDE_SESSION_KEY`

```yaml
env:
  CLAUDE_SESSION_KEY: ${{ secrets.CLAUDE_SESSION_KEY }}
```

## Option 2: Let claude-yolt Handle It

claude-yolt's YOLT mode might bypass authentication entirely:

```yaml
- name: Run claude-yolt
  run: |
    # Just try to run it - YOLT mode may work without auth
    claude-yolt "analyze this code"
```

## Option 3: Auth Manager

claude-yolt includes an auth manager that can persist tokens:

```yaml
- name: Setup Auth
  run: |
    # The auth manager may have cached credentials
    claude-yolt --check-auth || echo "No auth cached"
```

## Process Limits for CI

Always use conservative limits in CI:

```yaml
env:
  CLAUDE_MAX_PROCESSES: "20"   # Much lower than default 200
  CLAUDE_PROCESS_DELAY: "100"  # Slower spawning
```

## Handling Failures

claude-yolt commands should always have timeouts and fallbacks:

```yaml
- name: Run Analysis
  run: |
    timeout 300 claude-yolt "analyze" || {
      echo "Analysis failed or timed out"
      # Run fallback static analysis
    }
```

## Free Alternatives

If claude-yolt auth fails, workflows can fall back to:
- Static analysis (ESLint, JSHint)
- Free AI models (Gemini via aider)
- Pattern matching and complexity analysis