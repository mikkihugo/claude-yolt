import { spawn as originalSpawn, exec as originalExec } from 'child_process';
import { processManager } from './process-manager-native.js';
import { streamHandler } from './stream-handler.js';
import chalk from 'chalk';

// Performance metrics
let interceptCount = 0;
let queueHighWater = 0;

// Optimized spawn wrapper
function optimizedSpawn(command, args = [], options = {}) {
  interceptCount++;
  
  // Fast path for critical system commands
  const basename = command.split('/').pop();
  if (['sh', 'bash', 'node', 'git'].includes(basename)) {
    return originalSpawn(command, args, options);
  }
  
  // Inject safety limits
  const safeArgs = processManager.interceptCommand(basename, args);
  
  // Check if we should queue
  if (!processManager.registerProcess(-1, command, safeArgs)) {
    queueHighWater = Math.max(queueHighWater, processManager.queue.length);
    
    if (interceptCount % 100 === 0) {
      console.log(chalk.yellow(`⚡ Process limiter: ${processManager.processMap.size} active, ${processManager.queue.length} queued (high: ${queueHighWater})`));
    }
    
    // Return a promise-like object that queues the spawn
    return createQueuedSpawn(command, safeArgs, options);
  }
  
  // Execute immediately
  const child = originalSpawn(command, safeArgs, options);
  
  if (child.pid) {
    processManager.registerProcess(child.pid, command, safeArgs);
    
    // Efficient stream handling
    if (streamHandler.willProduceLargeOutput(command, safeArgs)) {
      streamHandler.handleProcessStreams(child);
    }
    
    // Clean up on exit
    child.once('exit', () => {
      processManager.processMap.delete(child.pid);
      processManager.cleanupProcesses();
    });
  }
  
  return child;
}

// Create a queued spawn that behaves like a child process
function createQueuedSpawn(command, args, options) {
  const EventEmitter = require('events');
  const fake = new EventEmitter();
  
  // Add child process properties
  Object.assign(fake, {
    pid: -1,
    stdin: { write: () => true, end: () => {} },
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    kill: () => false,
    killed: false
  });
  
  // Queue the actual spawn
  const checkQueue = setInterval(() => {
    if (processManager.registerProcess(-1, command, args)) {
      clearInterval(checkQueue);
      
      // Now actually spawn
      const real = originalSpawn(command, args, options);
      
      // Transfer to real process
      fake.pid = real.pid;
      processManager.registerProcess(real.pid, command, args);
      
      // Pipe events efficiently
      real.stdout?.pipe(fake.stdout);
      real.stderr?.pipe(fake.stderr);
      real.on('exit', (code, signal) => fake.emit('exit', code, signal));
      real.on('error', (err) => fake.emit('error', err));
      
      // Handle streams
      if (streamHandler.willProduceLargeOutput(command, args)) {
        streamHandler.handleProcessStreams(real);
      }
      
      real.once('exit', () => {
        processManager.processMap.delete(real.pid);
        processManager.cleanupProcesses();
      });
    }
  }, 50); // Check every 50ms
  
  return fake;
}

// Optimized exec wrapper
function optimizedExec(command, options, callback) {
  // Parse command to check limits
  const cmdParts = command.split(' ');
  const baseCmd = cmdParts[0].split('/').pop();
  
  // Inject limits for known commands
  if (['fd', 'rg', 'cargo', 'make'].includes(baseCmd)) {
    const limits = {
      'fd': '--threads=1 --max-results=1000',
      'rg': '--threads=1 --max-count=100',
      'cargo': '--jobs=2',
      'make': '-j2'
    };
    
    if (limits[baseCmd] && !command.includes(limits[baseCmd].split(' ')[0])) {
      command = `${cmdParts[0]} ${limits[baseCmd]} ${cmdParts.slice(1).join(' ')}`;
    }
  }
  
  return originalExec(command, options, callback);
}

// Inject into child_process module
export async function injectOptimizedInterceptor() {
  const cp = await import('child_process');
  
  // Store originals
  if (!cp._optimizedOriginals) {
    cp._optimizedOriginals = {
      spawn: cp.spawn,
      exec: cp.exec
    };
  }
  
  // Replace with optimized versions
  cp.spawn = optimizedSpawn;
  cp.exec = optimizedExec;
  
  // Start cleanup timer
  setInterval(() => {
    processManager.cleanupProcesses();
  }, 500);
  
  console.log(chalk.green('✓ Optimized process interceptor active'));
  console.log(chalk.cyan(`  Max concurrent: ${processManager.maxConcurrent}`));
  console.log(chalk.cyan(`  Using ${processManager.useSharedMemory ? 'shared memory' : 'fallback'} monitoring`));
}

// Auto-inject on import
injectOptimizedInterceptor().catch(console.error);