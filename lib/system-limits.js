import { spawn } from 'child_process';
import chalk from 'chalk';

// Apply system-level resource limits using ulimit
export function applySystemLimits(limits) {
  const commands = [
    // DON'T limit processes with ulimit - it causes hard failures!
    // Our JavaScript queue handles this gracefully instead
    
    // Only limit file descriptors (increase for many processes)
    `ulimit -n 4096`,
  ];
  
  // Apply limits to current shell
  const shellCommand = commands.join('; ');
  
  console.log(chalk.cyan('🛡️  System limits: max ${limits.maxProcs || 100} processes'));
  
  return shellCommand;
}

// Create a wrapper script that enforces limits
export function createLimitedWrapper(originalCliPath, limits) {
  const wrapperScript = `#!/bin/bash
# Claude-YOLT system limits wrapper

# Enable job control for proper process management
set -m

# Trap signals to ensure cleanup
trap 'kill $(jobs -p) 2>/dev/null' EXIT

# Apply minimal ulimits - avoid hard kills!
# ulimit -u (processes) causes "Resource temporarily unavailable"
# ulimit -v (memory) causes OOM kills
# ulimit -t (CPU time) kills long-running processes

# Only apply safe limits:
ulimit -n 8192                          # file descriptors (high for many processes)
ulimit -c 0                             # no core dumps (save disk space)

# Set environment variables for build tools
export MAKEFLAGS="-j${limits.makeJobs || 4}"
export CARGO_BUILD_JOBS="${limits.cargoJobs || 4}"
export CARGO_INCREMENTAL="0"
export RUST_MIN_THREADS="1"
export RUST_MAX_THREADS="${limits.cargoJobs || 4}"
export RAYON_NUM_THREADS="${limits.cargoJobs || 4}"
export CMAKE_BUILD_PARALLEL_LEVEL="${limits.makeJobs || 4}"

# Run node with proper signal handling
exec node "${originalCliPath}" "$@" &
PID=$!

# Wait for the process and ensure cleanup
wait $PID
EXIT_CODE=$?

# Clean up any remaining child processes
kill $(jobs -p) 2>/dev/null

exit $EXIT_CODE
`;
  
  return wrapperScript;
}

// Monitor system resources
export function monitorSystemResources() {
  setInterval(() => {
    // Check process count
    spawn('bash', ['-c', 'ps aux | wc -l'], {
      stdio: ['ignore', 'pipe', 'ignore']
    }).stdout.on('data', (data) => {
      const count = parseInt(data.toString().trim());
      if (count > 500) {
        console.warn(chalk.red(`\n⚠️  System process count critical: ${count}`));
        
        // Emergency: Kill all cargo/rustc processes
        spawn('bash', ['-c', 'pkill -9 -f "(cargo|rustc)"']);
      }
    });
  }, 5000); // Check every 5 seconds
}