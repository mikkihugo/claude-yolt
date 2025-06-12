# 🆓 FREE AI Models for claude-yolt

All models below are **100% FREE** via OpenRouter. No Claude needed!

## Setup

1. Get free API key from https://openrouter.ai
2. Add to GitHub: `gh secret set OPENROUTER_API_KEY`

## Best Free Models by Use Case

### 🧠 Deep Analysis & Reasoning
```yaml
# Shows step-by-step thinking process
model: deepseek/deepseek-r1:free
model: deepseek/deepseek-r1-distill-llama-70b:free
model: deepseek/deepseek-r1-distill-qwen-32b:free
```

### 💻 Code Review & Generation
```yaml
# Specialized for code
model: qwen/qwen-2.5-coder-32b-instruct:free
model: mistralai/codestral-2405:free
model: deepseek/deepseek-coder-v2-lite-instruct:free
```

### 📚 Large Context (1M tokens!)
```yaml
# For analyzing entire codebases
model: google/gemini-flash-1.5:free
model: google/gemini-pro-1.5:free
```

### 🚀 General Purpose
```yaml
# Excellent all-around models
model: nousresearch/hermes-3-llama-3.1-405b:free
model: meta-llama/llama-3.2-90b-vision-instruct:free
model: cohere/command-r-plus-08-2024:free
model: mistralai/mistral-large-2411:free
```

### ⚡ Fast & Light
```yaml
# Quick responses
model: microsoft/phi-3-mini-128k-instruct:free
model: huggingfaceh4/zephyr-7b-beta:free
model: google/gemma-2-9b-it:free
```

## Aider Dual Mode Combinations

### Best Pairings (All Free!)

```bash
# Deep thinking + Code expertise
aider --architect deepseek/deepseek-r1:free \
      --editor qwen/qwen-2.5-coder-32b-instruct:free

# Large context + Fast execution  
aider --architect google/gemini-pro-1.5:free \
      --editor mistralai/codestral-2405:free

# Powerful general + Code specialist
aider --architect nousresearch/hermes-3-llama-3.1-405b:free \
      --editor deepseek/deepseek-coder-v2-lite-instruct:free
```

## Example Workflows

### PR Review (FREE)
```yaml
- name: Review PR
  run: |
    curl -X POST https://openrouter.ai/api/v1/chat/completions \
      -H "Authorization: Bearer $OPENROUTER_API_KEY" \
      -d '{
        "model": "deepseek/deepseek-r1:free",
        "messages": [{
          "role": "user",
          "content": "Review this code..."
        }]
      }'
```

### Bug Hunt (FREE)
```yaml
- name: Find Bugs
  run: |
    aider --model qwen/qwen-2.5-coder-32b-instruct:free \
          --openrouter-api-key "$OPENROUTER_API_KEY" \
          --message "Find bugs in this code" \
          lib/process-interceptor.js
```

## Cost Comparison

| Model | Cost | Quality | Speed |
|-------|------|---------|-------|
| DeepSeek R1 | FREE | Excellent | Medium |
| Hermes 3 405B | FREE | Excellent | Slow |
| Qwen 2.5 Coder | FREE | Very Good | Fast |
| Gemini Pro 1.5 | FREE | Very Good | Fast |
| Codestral | FREE | Good | Fast |
| Phi-3 Mini | FREE | Decent | Very Fast |

## Why No Claude?

- All these models are FREE
- DeepSeek R1 rivals GPT-4 quality
- Qwen 2.5 Coder beats Claude for code
- Gemini Pro 1.5 has 1M context (vs Claude's 200k)
- No cost concerns - use as much as needed!

## Quick Start

```bash
# Add your OpenRouter key
export OPENROUTER_API_KEY="sk-or-..."

# Use with aider
pip install aider-chat
aider --model deepseek/deepseek-r1:free --openrouter-api-key $OPENROUTER_API_KEY

# Or direct API
curl https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -d '{"model": "qwen/qwen-2.5-coder-32b-instruct:free", "messages": [...]}'
```