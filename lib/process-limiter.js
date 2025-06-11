import { spawn as originalSpawn, exec as originalExec } from 'child_process';
import chalk from 'chalk';

// Global process tracking
const activeProcesses = new Set();
const processQueue = [];
let maxConcurrent = 10; // Maximum concurrent processes
let processDelay = 100; // Delay between spawning processes (ms)

// Set limits
export function setProcessLimits(max = 10, delay = 100) {
  maxConcurrent = max;
  processDelay = delay;
  console.log(chalk.cyan(`⚙️  Process limits: max ${max} concurrent, ${delay}ms delay between spawns`));
}

// Process queue handler
async function processQueueHandler() {
  while (processQueue.length > 0 && activeProcesses.size < maxConcurrent) {
    const { fn, resolve } = processQueue.shift();
    
    // Add delay to slow down process creation
    await new Promise(r => setTimeout(r, processDelay));
    
    const result = fn();
    resolve(result);
  }
}

// Wrapped spawn that respects limits
export function limitedSpawn(command, args, options) {
  return new Promise((resolve) => {
    const fn = () => {
      console.log(chalk.gray(`[${activeProcesses.size + 1}/${maxConcurrent}] Spawning: ${command} ${args?.slice(0, 3).join(' ')}...`));
      
      const child = originalSpawn(command, args, options);
      activeProcesses.add(child.pid);
      
      child.on('exit', () => {
        activeProcesses.delete(child.pid);
        console.log(chalk.gray(`[${activeProcesses.size}/${maxConcurrent}] Process ${child.pid} exited`));
        processQueueHandler(); // Process next in queue
      });
      
      child.on('error', () => {
        activeProcesses.delete(child.pid);
        processQueueHandler();
      });
      
      return child;
    };
    
    if (activeProcesses.size < maxConcurrent) {
      resolve(fn());
    } else {
      console.log(chalk.yellow(`⏳ Queue full (${activeProcesses.size}/${maxConcurrent}), waiting...`));
      processQueue.push({ fn, resolve });
    }
  });
}

// Wrapped exec that respects limits
export function limitedExec(command, options, callback) {
  // Handle different argument patterns
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  
  return new Promise((resolve) => {
    const fn = () => {
      console.log(chalk.gray(`[${activeProcesses.size + 1}/${maxConcurrent}] Exec: ${command.substring(0, 50)}...`));
      
      const execProcess = originalExec(command, options, (err, stdout, stderr) => {
        activeProcesses.delete(execProcess.pid);
        console.log(chalk.gray(`[${activeProcesses.size}/${maxConcurrent}] Exec completed`));
        processQueueHandler();
        
        if (callback) {
          callback(err, stdout, stderr);
        }
        resolve({ err, stdout, stderr });
      });
      
      activeProcesses.add(execProcess.pid);
      return execProcess;
    };
    
    if (activeProcesses.size < maxConcurrent) {
      fn();
    } else {
      console.log(chalk.yellow(`⏳ Queue full (${activeProcesses.size}/${maxConcurrent}), waiting...`));
      processQueue.push({ fn, resolve });
    }
  });
}

// Monkey-patch child_process to intercept ALL process creation
export function interceptProcessCreation(limits = { max: 10, delay: 100 }) {
  setProcessLimits(limits.max, limits.delay);
  
  // Import using dynamic import for ES modules
  import('child_process').then(cp => {
    // Store originals
    const originals = {
      spawn: cp.spawn,
      exec: cp.exec,
      execSync: cp.execSync,
      spawnSync: cp.spawnSync,
      execFile: cp.execFile,
      execFileSync: cp.execFileSync,
      fork: cp.fork
    };
    
    // Replace spawn with async limited version
    cp.spawn = function(command, args, options) {
      // Special handling for certain commands that should bypass limits
      if (command === 'kill' || command === 'pkill' || command === 'renice') {
        return originals.spawn.call(this, command, args, options);
      }
      
      // For now, return the promise-based limited spawn synchronously
      // This maintains compatibility but loses some async benefits
      let childProcess;
      limitedSpawn(command, args, options).then(child => {
        childProcess = child;
      });
      
      // Return a stub that will be populated
      return childProcess || originals.spawn.call(this, command, args, options);
    };
    
    // Replace exec with limited version
    cp.exec = function(command, options, callback) {
      // Special handling for system commands
      if (command.includes('kill') || command.includes('pkill') || command.includes('ps')) {
        return originals.exec.call(this, command, options, callback);
      }
      
      limitedExec(command, options, callback);
      
      // Return a stub child process
      return {
        pid: -1,
        kill: () => {},
        on: () => {},
        stdout: { on: () => {} },
        stderr: { on: () => {} }
      };
    };
    
    // For sync versions, add delay but don't queue
    cp.execSync = function(...args) {
      const command = args[0];
      if (!command.includes('kill') && !command.includes('ps')) {
        // Rate limit by sleeping
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, processDelay);
      }
      return originals.execSync.apply(this, args);
    };
    
    cp.spawnSync = function(...args) {
      const command = args[0];
      if (command !== 'kill' && command !== 'pkill') {
        // Rate limit by sleeping
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, processDelay);
      }
      return originals.spawnSync.apply(this, args);
    };
    
    console.log(chalk.green('✓ Process creation intercepted and limited'));
  });
}