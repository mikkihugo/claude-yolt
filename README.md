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

- **Process limiting**: Max 200 concurrent (queues extras, never fails)
- **Stream handling**: Prevents pipe buffer deadlock by draining stdout/stderr
- **Permission bypass**: No security prompts (⚠️ security risk)
- **Search tools**: Forces `fd` and `rg` to single-threaded mode
- **Cargo control**: Forces `--jobs 4` on all cargo commands
- **Build tools**: Limits make/cmake/ninja parallelism via env vars
- **Hang detection**: Kills processes with 0% CPU for >10s
- **Nice level**: All processes run at lower priority
- **Transparent**: Works exactly like claude, just slower

## Credits

Inspired by [claude-yolo](https://github.com/eastlondoner/claude-yolo) by [eastlondoner](https://github.com/eastlondoner).

## License

MIT