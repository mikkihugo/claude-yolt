import { spawn, exec } from 'child_process';
import chalk from 'chalk';

// Safety mode configurations
export const SAFETY_MODES = {
  yolt: {
    maxMemMB: 4096,
    maxProcs: 50,
    cpuLimit: 1800, // 30 minutes
    nice: 10
  },
  airbag: {
    maxMemMB: 2048,
    maxProcs: 20,
    cpuLimit: 300, // 5 minutes
    nice: 15
  },
  seatbelt: {
    maxMemMB: 3072,
    maxProcs: 30,
    cpuLimit: 600, // 10 minutes
    nice: 12
  }
};

// Apply resource limits via environment variables
export function applyResourceLimits(limits) {
  return {
    // Limit parallel execution
    MAKEFLAGS: '-j2',
    CARGO_BUILD_JOBS: '2',
    RUST_MIN_THREADS: '1', 
    RUST_MAX_THREADS: '4',
    GOMAXPROCS: '2',
    OMP_NUM_THREADS: '2',
    FD_THREADS: '2',
    
    // Memory settings
    NODE_OPTIONS: `--max-old-space-size=${limits.maxMemMB || 4096} --max-listeners=20`,
  };
}

// Monitor process and apply throttling
export function monitorProcess(pid, limits) {
  let monitoring = true;
  const monitoredPids = new Set([pid]);
  
  const interval = setInterval(() => {
    if (!monitoring) return;
    
    // Get all child processes
    exec(`pgrep -P ${pid}`, (err, stdout) => {
      if (err) return;
      
      const childPids = stdout.trim().split('\n').filter(Boolean).map(Number);
      childPids.forEach(p => monitoredPids.add(p));
      
      // Check process count
      exec(`pgrep -u $USER | wc -l`, (err, stdout) => {
        if (err) return;
        
        const procCount = parseInt(stdout.trim());
        if (procCount > limits.maxProcs) {
          console.warn(chalk.yellow(`⚠️  High process count: ${procCount}`));
        }
      });
      
      // Apply nice level to all processes
      monitoredPids.forEach(p => {
        exec(`renice -n ${limits.nice || 10} -p ${p} 2>/dev/null`);
        exec(`ionice -c 3 -p ${p} 2>/dev/null`);
      });
    });
  }, 1000);
  
  // Set CPU time limit
  if (limits.cpuLimit) {
    exec(`ulimit -t ${limits.cpuLimit}`);
  }
  
  return {
    stop: () => {
      monitoring = false;
      clearInterval(interval);
    }
  };
}

// Wrap specific commands with extra safety
export function wrapCommand(cmd, args) {
  const wrappedCmds = {
    'fd': ['--threads=2'],
    'find': ['fd', '--threads=2'], // Replace find with fd
    'rg': ['--threads=2'],
    'cargo': ['build', '--jobs=2'],
    'make': ['-j2']
  };
  
  if (wrappedCmds[cmd]) {
    if (cmd === 'find') {
      // Replace find with fd
      return { cmd: 'fd', args: [...wrappedCmds.find, ...args] };
    }
    return { cmd, args: [...wrappedCmds[cmd], ...args] };
  }
  
  return { cmd, args };
}

// Safety wrapper for any command
export function runWithSafety(command, mode = 'yolt') {
  const limits = SAFETY_MODES[mode];
  if (!limits) {
    console.error(chalk.red(`Unknown safety mode: ${mode}`));
    process.exit(1);
  }
  
  console.log(chalk.cyan(`🛡️  Running with ${mode} safety limits`));
  console.log(chalk.gray(`  Memory: ${limits.maxMemMB}MB, Processes: ${limits.maxProcs}, CPU: ${limits.cpuLimit}s`));
  
  // Apply environment limits
  const env = {
    ...process.env,
    ...applyResourceLimits(limits)
  };
  
  // Parse command
  const [cmd, ...args] = command.split(' ');
  const wrapped = wrapCommand(cmd, args);
  
  // Spawn the process
  const child = spawn(wrapped.cmd, wrapped.args, {
    env,
    stdio: 'inherit',
    shell: true
  });
  
  // Monitor the process
  const monitor = monitorProcess(child.pid, limits);
  
  child.on('exit', (code) => {
    monitor.stop();
    process.exit(code || 0);
  });
  
  child.on('error', (err) => {
    monitor.stop();
    console.error(chalk.red(`Error: ${err.message}`));
    process.exit(1);
  });
}