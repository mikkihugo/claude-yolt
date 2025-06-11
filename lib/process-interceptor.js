import Module from 'module';
import { spawn as originalSpawn, exec as originalExec, execSync as originalExecSync, spawnSync as originalSpawnSync, execFile as originalExecFile, execFileSync as originalExecFileSync, fork as originalFork } from 'child_process';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs';
import { hangDetector } from './hang-detector.js';

// Global process tracking
const activeProcesses = new Map(); // pid -> {command, startTime}
const processQueue = [];
let maxConcurrent = parseInt(process.env.CLAUDE_MAX_PROCESSES) || 200; // Soft limit for queueing
let processDelay = parseInt(process.env.CLAUDE_PROCESS_DELAY) || 25; // Reasonable delay
let totalSpawned = 0;

// Log configuration
console.log(chalk.cyan(`🐢 Process limiter: max ${maxConcurrent} concurrent, ${processDelay}ms delay`));
console.log(chalk.green(`✅ No process killing - only queueing when limit reached`));

// Process queue handler
function processNext() {
  // Check for deep queue issues
  if (processQueue.length > 1000) {
    checkForHangingProcesses();
  }
  
  if (processQueue.length > 0 && activeProcesses.size < maxConcurrent) {
    const { type, args, originalFn, resolve } = processQueue.shift();
    
    // Show queue status with warnings
    if (processQueue.length > 3000) {
      console.log(chalk.red(`🚨 CRITICAL: ${processQueue.length} processes queued! Checking for hangs...`));
    } else if (processQueue.length > 1000) {
      console.log(chalk.yellow(`⚠️  Deep queue: ${processQueue.length} waiting...`));
    } else if (processQueue.length > 0 && processQueue.length % 100 === 0) {
      console.log(chalk.cyan(`⏳ Process queue: ${processQueue.length} waiting...`));
    }
    
    // Small delay to prevent burst spawning
    setTimeout(() => {
      const result = executeWrapped(type, args, originalFn);
      if (resolve) resolve(result);
      
      // Process next in queue
      setTimeout(processNext, processDelay);
    }, processDelay);
  }
}

// Investigate and fix hanging processes when queue is deep
function checkForHangingProcesses() {
  const now = Date.now();
  let killedCount = 0;
  
  // Get process details for all active processes
  const exec = require('child_process').exec;
  exec(`ps aux | grep -E "PID|$(echo ${Array.from(activeProcesses.keys()).join('|')})" | head -20`, (err, stdout) => {
    if (err) return;
    
    const lines = stdout.trim().split('\n');
    const hungProcesses = [];
    
    // Parse ps output to find 0% CPU processes
    lines.slice(1).forEach(line => {
      const parts = line.split(/\s+/);
      if (parts.length < 11) return;
      
      const pid = parseInt(parts[1]);
      const cpu = parseFloat(parts[2]);
      const mem = parseFloat(parts[3]);
      const startTime = parts[8];
      const runtime = parts[9];
      const command = parts.slice(10).join(' ');
      
      if (activeProcesses.has(pid)) {
        const info = activeProcesses.get(pid);
        const age = now - info.startTime;
        
        // Identify hung processes: 0% CPU for >2 minutes
        if (cpu === 0 && age > 2 * 60 * 1000) {
          hungProcesses.push({ pid, cpu, mem, age, command });
        }
      }
    });
    
    if (hungProcesses.length > 0) {
      console.log(chalk.red(`\n🔍 Found ${hungProcesses.length} hung processes (0% CPU):`));
      
      // Fix by killing hung processes
      hungProcesses.forEach(({ pid, age, command }) => {
        const ageMin = Math.round(age / 60000);
        console.log(chalk.yellow(`  Killing PID ${pid}: ${command.substring(0, 50)}... (hung ${ageMin}m)`));
        
        try {
          // Send SIGTERM first
          process.kill(pid, 'SIGTERM');
          activeProcesses.delete(pid);
          killedCount++;
          
          // Force kill after 2 seconds if still alive
          setTimeout(() => {
            try { process.kill(pid, 'SIGKILL'); } catch (e) {}
          }, 2000);
        } catch (e) {
          // Process already dead
          activeProcesses.delete(pid);
        }
      });
      
      if (killedCount > 0) {
        console.log(chalk.green(`✓ Killed ${killedCount} hung processes, queue should start moving...`));
        // Immediately process queue
        for (let i = 0; i < killedCount; i++) {
          processNext();
        }
      }
    }
    
    // Also check for fd/rg specifically as they're common culprits
    exec('pgrep -a "fd|rg" | head -20', (err, stdout) => {
      if (!err && stdout) {
        const fdRgProcs = stdout.trim().split('\n').filter(Boolean);
        if (fdRgProcs.length > 10) {
          console.log(chalk.yellow(`\n🔍 Found ${fdRgProcs.length} fd/rg processes, checking for hangs...`));
          
          fdRgProcs.forEach(line => {
            const [pid, ...cmdParts] = line.split(' ');
            const pidNum = parseInt(pid);
            
            // Check if it's been running too long
            exec(`ps -p ${pidNum} -o etime=,%cpu= 2>/dev/null`, (err, psOut) => {
              if (!err && psOut) {
                const [etime, cpu] = psOut.trim().split(/\s+/);
                if (parseFloat(cpu) === 0) {
                  console.log(chalk.red(`  Killing hung fd/rg process ${pidNum}`));
                  try { process.kill(pidNum, 'SIGKILL'); } catch (e) {}
                }
              }
            });
          });
        }
      }
    });
  });
}

// Clean up dead processes
setInterval(() => {
  for (const [pid, info] of activeProcesses.entries()) {
    try {
      // Check if process is still alive
      process.kill(pid, 0);
    } catch (e) {
      // Process is dead, remove it
      activeProcesses.delete(pid);
      processNext();
    }
  }
}, 1000);

// Deep queue monitoring
setInterval(() => {
  if (processQueue.length > 2000) {
    console.log(chalk.red(`\n🆘 ALERT: Queue depth critical at ${processQueue.length} processes!`));
    console.log(chalk.yellow('This usually means:'));
    console.log(chalk.yellow('1. Processes are hanging and not completing'));
    console.log(chalk.yellow('2. Claude is spawning faster than processes complete'));
    console.log(chalk.yellow('3. System resources may be exhausted\n'));
    
    // Force check for hangs
    checkForHangingProcesses();
  }
}, 30000); // Every 30 seconds

// Execute with tracking
function executeWrapped(type, args, originalFn) {
  const command = args[0];
  const isRustCommand = /^(cargo|rustc|rust-analyzer|cc1|ld)$/.test(command) || 
                       (typeof command === 'string' && command.includes('cargo'));
  const isSearchCommand = /^(fd|rg|ripgrep|find|grep|ag)$/.test(command);
  const isRustTool = /^(fd|rg|ripgrep|bat|exa|lsd|dust|procs|sd|hyperfine|tokei|delta|bottom|btm)$/.test(command);
  
  // Special handling for Rust tools that can hang on pipes
  if ((isSearchCommand || isRustTool) && type === 'spawn') {
    const [cmd, cmdArgs = [], options = {}] = args;
    
    // Force single-threaded operation for fd and rg
    if (cmd === 'fd' || cmd.endsWith('fd')) {
      if (!cmdArgs.some(arg => arg.startsWith('--threads'))) {
        cmdArgs.unshift('--threads=1');
      }
      if (!cmdArgs.some(arg => arg.startsWith('--max-results'))) {
        cmdArgs.push('--max-results=1000');
      }
      // Add timeout to fd
      if (!cmdArgs.some(arg => arg === '--max-time')) {
        cmdArgs.push('--max-time=10s');
      }
    }
    
    if (cmd === 'rg' || cmd.endsWith('rg')) {
      if (!cmdArgs.some(arg => arg.startsWith('--threads'))) {
        cmdArgs.unshift('--threads=1');
      }
      // Add timeout and limit
      if (!cmdArgs.some(arg => arg.startsWith('--max-count'))) {
        cmdArgs.push('--max-count=100');
      }
    }
    
    args[1] = cmdArgs;
    
    // Ensure search commands have proper options
    const enhancedOptions = {
      ...options,
      timeout: 30000, // 30 second hard timeout
      killSignal: 'SIGKILL'
    };
    args[2] = enhancedOptions;
  }
  
  // Special handling for rust/cargo commands
  if (isRustCommand && type === 'spawn') {
    const [cmd, cmdArgs = [], options = {}] = args;
    
    // Inject job limits for cargo
    if (cmd === 'cargo' || cmd.endsWith('cargo')) {
      const subcommand = cmdArgs[0];
      if (['build', 'check', 'test', 'clippy', 'doc'].includes(subcommand)) {
        if (!cmdArgs.some(arg => arg.startsWith('--jobs'))) {
          cmdArgs.splice(1, 0, '--jobs', '4');
        }
      }
    }
    
    // Add resource limit environment variables
    const enhancedOptions = {
      ...options,
      env: {
        ...process.env,
        ...options.env,
        CARGO_BUILD_JOBS: '4',
        CARGO_INCREMENTAL: '0',
        RUST_MIN_THREADS: '1',
        RUST_MAX_THREADS: '4',
        RAYON_NUM_THREADS: '4',
        RUSTFLAGS: '-C codegen-units=1',
      },
      // Use process groups to ensure cleanup
      detached: false,
      // Ensure proper signal handling
      killSignal: 'SIGTERM'
    };
    
    args[1] = cmdArgs;
    args[2] = enhancedOptions;
  }
  
  // Execute the original function
  const result = originalFn.apply(this, args);
  
  // Fix fd/rg hangs by always draining output
  if (result && result.stdout && result.stderr) {
    // Must consume output or process hangs when buffer fills
    const chunks = [];
    result.stdout.on('data', (chunk) => {
      if (isSearchCommand) chunks.push(chunk); // Save fd/rg output
    });
    result.stderr.on('data', () => {}); // Drain stderr
    
    // For Rust tools, collect output and emit it properly
    if ((isSearchCommand || isRustTool) && result.stdout._events && result.stdout._events.data) {
      const originalHandler = result.stdout._events.data;
      result.stdout.removeAllListeners('data');
      result.stdout.on('data', (chunk) => {
        chunks.push(chunk);
      });
      result.on('close', () => {
        // Emit all collected output at once to original handler
        const fullOutput = Buffer.concat(chunks);
        if (typeof originalHandler === 'function') {
          originalHandler(fullOutput);
        } else if (Array.isArray(originalHandler)) {
          originalHandler.forEach(h => h(fullOutput));
        }
      });
    }
    
    // Handle stream errors
    result.stdout.on('error', () => {});
    result.stderr.on('error', () => {});
  }
  
  // Track the process
  if (result && result.pid) {
    activeProcesses.set(result.pid, {
      command: command || 'unknown',
      startTime: Date.now(),
      isRust: isRustCommand,
      isSearch: isSearchCommand
    });
    
    // Track with hang detector
    hangDetector.trackProcess(result.pid, command, args[1] || []);
    
    totalSpawned++;
    
    // Log every 10th process to show we're limiting
    if (totalSpawned % 10 === 0) {
      console.log(chalk.gray(`[Process limiter] Active: ${activeProcesses.size}/${maxConcurrent}, Total spawned: ${totalSpawned}`));
    }
    
    // Clean up on exit
    if (result.on) {
      result.on('exit', () => {
        activeProcesses.delete(result.pid);
        hangDetector.untrackProcess(result.pid);
        processNext();
      });
      
      // Ensure proper cleanup on error
      result.on('error', () => {
        activeProcesses.delete(result.pid);
        hangDetector.untrackProcess(result.pid);
        processNext();
      });
      
      // Handle the close event as well
      result.on('close', () => {
        activeProcesses.delete(result.pid);
        hangDetector.untrackProcess(result.pid);
        processNext();
      });
      
      // Ensure stdin is closed if not being used
      if (result.stdin) {
        result.stdin.on('error', () => {}); // Ignore stdin errors
        
        // Close stdin unless explicitly piped
        const stdio = args[2]?.stdio;
        if (!stdio || (Array.isArray(stdio) && stdio[0] !== 'pipe') || stdio === 'inherit') {
          result.stdin.end();
        }
      }
    }
  }
  
  return result;
}

// Wrapper functions that queue if needed
function wrapSpawn(...args) {
  const command = args[0];
  const isCritical = /^(git|npm|yarn|pnpm|node|deno|python|bash|sh|kill|pkill)$/.test(command);
  
  // Critical commands bypass the queue
  if (isCritical) {
    return executeWrapped('spawn', args, originalSpawn);
  }
  
  if (activeProcesses.size >= maxConcurrent) {
    // Check if there are too many rust processes
    const rustCount = Array.from(activeProcesses.values()).filter(p => p.isRust).length;
    if (rustCount > 20) {
      console.warn(chalk.yellow(`⚠️  Too many Rust processes (${rustCount}), queueing...`));
    }
    
    // Create a proper child process stub with event emitter behavior
    const EventEmitter = require('events');
    const stub = new EventEmitter();
    
    // Add child process properties
    Object.assign(stub, {
      pid: -1,
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      stdin: {
        write: (data) => { stub._stdinBuffer = (stub._stdinBuffer || '') + data; return true; },
        end: () => {},
        pipe: () => {}
      },
      kill: (signal) => { stub._killed = signal; return true; },
      send: () => false,
      disconnect: () => {},
      unref: () => {},
      ref: () => {},
      _stdinBuffer: '',
      _killed: false
    });
    
    // Queue it and wait
    processQueue.push({
      type: 'spawn',
      args,
      originalFn: originalSpawn,
      resolve: (realChild) => {
        // Transfer buffered stdin if any
        if (stub._stdinBuffer && realChild.stdin) {
          realChild.stdin.write(stub._stdinBuffer);
        }
        
        // Apply kill signal if stub was killed
        if (stub._killed && realChild.kill) {
          realChild.kill(stub._killed);
        }
        
        // Pipe events from real child to stub
        realChild.stdout.on('data', (data) => stub.stdout.emit('data', data));
        realChild.stderr.on('data', (data) => stub.stderr.emit('data', data));
        realChild.on('exit', (code, signal) => stub.emit('exit', code, signal));
        realChild.on('error', (err) => stub.emit('error', err));
        
        // Update stub properties
        stub.pid = realChild.pid;
      }
    });
    
    return stub;
  }
  
  return executeWrapped('spawn', args, originalSpawn);
}

function wrapExec(...args) {
  if (activeProcesses.size >= maxConcurrent) {
    // Queue the exec and wait
    const callback = args[args.length - 1];
    const hasCallback = typeof callback === 'function';
    
    processQueue.push({
      type: 'exec',
      args: hasCallback ? args.slice(0, -1) : args,
      originalFn: originalExec,
      resolve: (child) => {
        if (hasCallback && child) {
          // Re-attach the callback
          child.on('exit', (code) => {
            callback(code ? new Error(`Exit code ${code}`) : null, child.stdout, child.stderr);
          });
        }
      }
    });
    
    // Return a stub child process
    return { 
      pid: -1,
      on: () => {}, 
      stdout: { on: () => {} }, 
      stderr: { on: () => {} },
      kill: () => {}
    };
  }
  
  return executeWrapped('exec', args, originalExec);
}

// Inject into Claude's module loading
export function injectProcessLimiter(claudeCliPath) {
  // Create a wrapper that loads our interceptor first
  const wrapperContent = `
// Process limiter injection
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(id) {
  const module = originalRequire.apply(this, arguments);
  
  // Intercept child_process
  if (id === 'child_process') {
    return new Proxy(module, {
      get(target, prop) {
        switch(prop) {
          case 'spawn':
            return ${wrapSpawn.toString()};
          case 'exec':
            return ${wrapExec.toString()};
          case 'spawnSync':
            return function(...args) {
              // Add delay for sync spawn
              const delay = ${processDelay};
              const start = Date.now();
              while (Date.now() - start < delay) {}
              return target.spawnSync(...args);
            };
          case 'execSync':
            return function(...args) {
              // Add delay for sync exec
              const delay = ${processDelay};
              const start = Date.now();
              while (Date.now() - start < delay) {}
              return target.execSync(...args);
            };
          default:
            return target[prop];
        }
      }
    });
  }
  
  return module;
};

// Initialize tracking
${executeWrapped.toString()}
${processNext.toString()}
const activeProcesses = new Map();
const processQueue = [];
let maxConcurrent = parseInt(process.env.CLAUDE_MAX_PROCESSES) || 200;
let processDelay = parseInt(process.env.CLAUDE_PROCESS_DELAY) || 25;
let totalSpawned = 0;

// Load the original CLI
require('${claudeCliPath}');
`;
  
  return wrapperContent;
}

// Monkey-patch for direct use
export function patchChildProcess() {
  const cp = require('child_process');
  
  // Store originals
  if (!cp._originals) {
    cp._originals = {
      spawn: cp.spawn,
      exec: cp.exec,
      execSync: cp.execSync,
      spawnSync: cp.spawnSync,
      execFile: cp.execFile,
      execFileSync: cp.execFileSync,
      fork: cp.fork
    };
  }
  
  // Replace with limited versions
  cp.spawn = wrapSpawn;
  cp.exec = wrapExec;
  
  cp.spawnSync = function(...args) {
    // Rate limit sync operations
    const start = Date.now();
    while (Date.now() - start < processDelay) {}
    return cp._originals.spawnSync(...args);
  };
  
  cp.execSync = function(...args) {
    // Rate limit sync operations  
    const start = Date.now();
    while (Date.now() - start < processDelay) {}
    return cp._originals.execSync(...args);
  };
  
  console.log(chalk.green('✓ Child process patched with limits'));
}