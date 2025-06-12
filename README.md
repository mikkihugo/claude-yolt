# claude-yolt

**⚠️ EXPERIMENTAL TOOL - USE AT YOUR OWN RISK ⚠️**

A drop-in replacement for `claude` CLI that fixes the process explosion bug ([#1970](https://github.com/anthropics/claude-code/issues/1970)).

## Problem

Claude CLI spawns thousands of processes without limits, causing system hangs. This wrapper fixes that with duct tape.

## Installation

```bash
npm install -g claude-yolt
```

## Usage

Use exactly like `claude`:

```bash
# Instead of: claude "fix this code"
claude-yolt "fix this code"

# Works with all claude flags
claude-yolt --help
claude-yolt --version
claude-yolt --model claude-3-opus-20240229
```

## What It Does

- Limits concurrent processes to 200 (queues extras instead of failing)
- Prevents pipe buffer deadlock by draining streams
- Bypasses permission prompts (⚠️ security risk)
- Forces single-threaded `fd` and `rg` searches
- Kills hung processes (0% CPU for >10s)

## Credits

Inspired by [claude-yolo](https://github.com/eastlondoner/claude-yolo) by [eastlondoner](https://github.com/eastlondoner).

## License

MIT