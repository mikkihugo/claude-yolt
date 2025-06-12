# GitHub Actions Workflows

This directory contains CI/CD workflows for claude-yolt. They work WITHOUT requiring any API keys!

## Workflows Overview

### 🔍 Basic Analysis (Always Works)
- `simple-analysis.yml` - Code complexity, patterns, dependencies
- `ci-cd.yml` - Build, test, security scanning
- `free-ai-review.yml` - AI review using free models

### 🤖 Advanced AI Features (Optional)
These workflows can use AI but will fallback to static analysis:
- `architecture-review.yml` - Architecture and design analysis
- `bug-hunter.yml` - Automated bug detection
- `optimization.yml` - Performance optimization suggestions

## API Options (All Optional)

### Option 1: No API Key (Default)
- Uses free Gemini Flash model via aider
- Falls back to static analysis tools
- Still provides useful insights!

### Option 2: OpenRouter (Recommended)
1. Get free API key from https://openrouter.ai
2. Add as secret: `OPENROUTER_API_KEY`
3. Access to many models (Gemini, Claude, GPT)

### Option 3: GitHub Models
- Automatically uses `GITHUB_TOKEN` 
- Limited availability (waitlist)

## Setup Instructions

### For Basic Features (No Setup Required!)
Just push code or open PRs - workflows will run automatically using free tools.

### For Enhanced AI Features
1. Go to Settings → Secrets → Actions
2. Add one of:
   - `OPENROUTER_API_KEY` - Get from https://openrouter.ai
   - No key needed for basic Gemini Flash via aider!

## Workflow Details

### `simple-analysis.yml`
- Runs weekly and on every push
- Code complexity analysis
- Pattern detection (memory leaks, etc)
- Dependency audit
- Performance baseline

### `free-ai-review.yml`  
- Reviews PRs using free AI models
- Security analysis with Semgrep
- Falls back to ESLint/JSHint

### Other Workflows
All advanced workflows will gracefully degrade to basic analysis if no AI is available.

## Cost

- **Free tier**: Gemini Flash via aider (default)
- **OpenRouter**: ~$0.001 per review with Gemini Flash
- **GitHub Models**: Free for public repos (when available)

## Disabling AI

To disable all AI features and use only static analysis:
1. Don't set any API key secrets
2. Workflows will automatically use fallback tools