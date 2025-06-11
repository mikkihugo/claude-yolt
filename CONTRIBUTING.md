# Contributing to claude-yolt

Thank you for considering contributing to claude-yolt! This project aims to fix critical issues in Claude Code that Anthropic hasn't addressed.

## How to Contribute

### Reporting Bugs
1. Check if the issue already exists
2. Use the bug report template
3. Include system info and steps to reproduce
4. If possible, include process counts when the issue occurs

### Suggesting Features
1. Open a discussion first
2. Explain the use case
3. Consider how it fits with the "just make it work" philosophy

### Pull Requests
1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing-fix`)
3. Make your changes
4. Add tests if applicable
5. Run `npm test`
6. Commit with descriptive message
7. Push and create PR

### Code Style
- Use ES modules
- Prefer async/await over callbacks
- Add JSDoc comments for public functions
- Keep the "pragmatic > perfect" approach

### Testing
- Test with real Claude Code scenarios
- Monitor actual process counts
- Verify no processes are killed unnecessarily
- Check that queuing works properly

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/claude-yolt.git
cd claude-yolt

# Install with mise
mise trust
mise run setup

# Run in dev mode
npm run dev
```

## Philosophy
- Fix real problems that affect users
- Don't wait for Anthropic to fix their bugs
- Pragmatic solutions over theoretical perfection
- Test with actual high-process scenarios

## Need Help?
- Open an issue for questions
- Check SESSION.md for development history
- Review existing workarounds in lib/bug-workarounds.js