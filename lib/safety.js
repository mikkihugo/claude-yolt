import { spawn, exec } from 'child_process';
import chalk from 'chalk';

// Safety mode configurations
export const SAFETY_MODES = {
  yolt: {
    maxMemMB: 4096,  // Soft warning threshold
    maxProcs: 200,   // Soft queueing threshold
    cpuLimit: 1800,  // Not enforced via ulimit
    nice: 10,
    cargoJobs: 4,    // Limit cargo parallel jobs
    makeJobs: 4      // Limit make parallel jobs
  },
  airbag: {
    maxMemMB: 2048,
    maxProcs: 20,
    cpuLimit: 300, // 5 minutes
    nice: 15,
    cargoJobs: 1,
    makeJobs: 1
  },
  seatbelt: {
    maxMemMB: 3072,
    maxProcs: 50,
    cpuLimit: 600, // 10 minutes
    nice: 12,
    cargoJobs: 2,
    makeJobs: 2
  }
};

// Apply resource limits via environment variables
export function applyResourceLimits(limits) {
  const jobs = limits.cargoJobs || 2;
  const makeJobs = limits.makeJobs || 2;
  
  return {
    // Limit parallel execution for various build tools
    MAKEFLAGS: `-j${makeJobs}`,
    CARGO_BUILD_JOBS: String(jobs),
    CARGO_INCREMENTAL: '0',  // Disable incremental to reduce memory usage
    RUST_MIN_THREADS: '1', 
    RUST_MAX_THREADS: String(jobs),
    RAYON_NUM_THREADS: String(jobs),  // Many Rust tools use rayon
    GOMAXPROCS: String(jobs),
    OMP_NUM_THREADS: String(jobs),
    FD_THREADS: String(jobs),
    CMAKE_BUILD_PARALLEL_LEVEL: String(makeJobs),
    NINJA_STATUS: '[%f/%t %es] ',  // Show progress for ninja builds
    
    // Memory settings
    NODE_OPTIONS: `--max-old-space-size=${limits.maxMemMB || 4096}`,
    
    // Force cargo to be more conservative
    CARGO_TERM_PROGRESS_WHEN: 'never',  // Reduce output spam
    CARGO_TERM_QUIET: 'false',
    RUSTFLAGS: '-C codegen-units=1',  // Reduce parallelism in rustc
  };
}

// Monitor process and apply throttling
export function monitorProcess(pid, limits) {
  let monitoring = true;
  const monitoredPids = new Set([pid]);
  const processStartTimes = new Map(); // Track when each process started
  let warnedAboutProcesses = false;
  
  // Hang detection thresholds
  const HANG_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes for most processes
  const RUST_HANG_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes for rust/cargo
  
  const interval = setInterval(() => {
    if (!monitoring) return;
    
    // Get all child processes recursively
    exec(`pstree -p ${pid} | grep -o '([0-9]\\+)' | grep -o '[0-9]\\+'`, (err, stdout) => {
      if (err) return;
      
      const allPids = stdout.trim().split('\n').filter(Boolean).map(Number);
      allPids.forEach(p => {
        if (!monitoredPids.has(p)) {
          monitoredPids.add(p);
          processStartTimes.set(p, Date.now());
        }
      });
      
      // Check for hung processes
      const now = Date.now();
      for (const [procPid, startTime] of processStartTimes.entries()) {
        if (procPid === pid) continue; // Don't kill main process
        
        const runtime = now - startTime;
        const isRustProcess = false; // We'll check this below
        const threshold = isRustProcess ? RUST_HANG_THRESHOLD_MS : HANG_THRESHOLD_MS;
        
        if (runtime > threshold) {
          // Check if process is actually hung (0% CPU)
          exec(`ps -p ${procPid} -o %cpu= 2>/dev/null || echo -1`, (err, stdout) => {
            const cpu = parseFloat(stdout.trim());
            if (cpu === 0 || cpu === -1) {
              console.warn(chalk.red(`\n🚫 Killing hung process ${procPid} (runtime: ${Math.round(runtime/1000)}s, CPU: ${cpu}%)`));
              exec(`kill -TERM ${procPid} 2>/dev/null`);
              setTimeout(() => {
                exec(`kill -KILL ${procPid} 2>/dev/null`);
              }, 5000);
              monitoredPids.delete(procPid);
              processStartTimes.delete(procPid);
            }
          });
        }
      }
      
      // Just monitor counts
      if (monitoredPids.size > limits.maxProcs * 3) {
        if (!warnedAboutProcesses) {
          console.warn(chalk.red(`\n🚨  WARNING: Very high process count (${monitoredPids.size})`));
          console.warn(chalk.yellow(`   System is queueing new processes to prevent overload`));
          warnedAboutProcesses = true;
        }
      }
      
      // Apply nice level to all processes
      monitoredPids.forEach(p => {
        exec(`renice -n ${limits.nice || 10} -p ${p} 2>/dev/null`);
        exec(`ionice -c 3 -p ${p} 2>/dev/null`);
      });
      
      // Clean up dead processes from tracking
      for (const procPid of monitoredPids) {
        if (!allPids.includes(procPid)) {
          monitoredPids.delete(procPid);
          processStartTimes.delete(procPid);
        }
      }
    });
    
    // Check for rust process explosion every 100ms
    exec(`pgrep -c '(cargo|rustc|rust-analyzer|cc1|ld)' || echo 0`, (err, stdout) => {
      if (err) return;
      
      const rustProcCount = parseInt(stdout.trim());
      if (rustProcCount > 1000) {
        console.warn(chalk.red(`\n🎯 Extreme rust process count: ${rustProcCount} - queueing is active`));
      } else if (rustProcCount > 100 && rustProcCount % 50 === 0) {
        // Only log every 50 to avoid spam
        console.warn(chalk.yellow(`\n🤖 Rust processes: ${rustProcCount} (queueing active)`));
      }
    });
    
    // Check for hung fd/rg processes specifically
    exec(`ps aux | grep -E '(fd|rg)' | grep -v grep | awk '{print $2, $9, $3}'`, (err, stdout) => {
      if (err) return;
      
      stdout.trim().split('\n').filter(Boolean).forEach(line => {
        const [procPid, startTimeStr, cpu] = line.split(' ');
        const cpuPercent = parseFloat(cpu);
        
        // If fd/rg has been running >60s with 0% CPU, it's hung
        if (cpuPercent === 0) {
          exec(`ps -p ${procPid} -o etime= 2>/dev/null`, (err, etimeOut) => {
            if (!err && etimeOut) {
              const etime = etimeOut.trim();
              // Parse etime (format: [[DD-]HH:]MM:SS)
              const parts = etime.split(':');
              const seconds = parts.length >= 2 ? parseInt(parts[parts.length-1]) + parseInt(parts[parts.length-2]) * 60 : 0;
              
              if (seconds > 60) {
                console.warn(chalk.red(`\n🚫 Killing hung search process ${procPid} (runtime: ${etime}, CPU: 0%)`));
                exec(`kill -KILL ${procPid} 2>/dev/null`);
              }
            }
          });
        }
      });
    });
  }, 100);  // Check every 100ms instead of 1000ms
  
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
export function wrapCommand(cmd, args, limits = SAFETY_MODES.yolt) {
  const jobs = limits.cargoJobs || 2;
  
  // More aggressive wrapping for problem commands
  const wrappedCmds = {
    'fd': ['--threads=1', '--max-results=1000'], // Single thread, limit results
    'find': [], // Keep find as-is, don't replace with fd
    'rg': ['--threads=1', '--max-count=100'], // Single thread, limit matches
    'cargo': (args) => {
      // Inject job limits into cargo commands
      if (args.includes('build') || args.includes('check') || args.includes('test')) {
        return ['--jobs', String(jobs), ...args];
      }
      return args;
    },
    'make': [`-j${limits.makeJobs || 2}`],
    'rustc': ['-C', 'codegen-units=1'],
    'npm': (args) => {
      if (args.includes('install') || args.includes('ci')) {
        return ['--no-audit', '--no-fund', ...args];
      }
      return args;
    }
  };
  
  if (wrappedCmds[cmd]) {
    // Don't replace find anymore - fd can be worse
    if (typeof wrappedCmds[cmd] === 'function') {
      return { cmd, args: wrappedCmds[cmd](args) };
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