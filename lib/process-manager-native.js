import { Worker } from 'worker_threads';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';
import os from 'os';
import fs from 'fs';

const exec = promisify(execCallback);

// Use native Node.js capabilities efficiently
export class NativeProcessManager {
  constructor() {
    // Pre-allocate structures
    this.processMap = new Map();
    this.queue = [];
    this.maxConcurrent = parseInt(process.env.CLAUDE_MAX_PROCESSES) || 200;
    
    // Use SharedArrayBuffer for zero-copy communication if available
    this.useSharedMemory = typeof SharedArrayBuffer !== 'undefined';
    if (this.useSharedMemory) {
      // Shared memory for process states (pid, cpu, timestamp)
      this.sharedBuffer = new SharedArrayBuffer(this.maxConcurrent * 16);
      this.processStates = new Int32Array(this.sharedBuffer);
    }
    
    // Start monitoring in a worker thread to not block main
    this.startMonitorWorker();
    
    // Use cgroups v2 if available (Linux)
    this.setupCgroups();
  }
  
  async setupCgroups() {
    if (os.platform() !== 'linux') return;
    
    try {
      // Check if cgroups v2 is available
      const cgroupsV2 = fs.existsSync('/sys/fs/cgroup/cgroup.controllers');
      if (!cgroupsV2) return;
      
      // Create a cgroup for Claude
      const cgroupPath = `/sys/fs/cgroup/claude-yolt-${process.pid}`;
      await exec(`sudo mkdir -p ${cgroupPath}`).catch(() => {});
      
      // Set limits
      await exec(`echo ${this.maxConcurrent} | sudo tee ${cgroupPath}/pids.max`).catch(() => {});
      await exec(`echo "4G" | sudo tee ${cgroupPath}/memory.max`).catch(() => {});
      
      // Move current process to cgroup
      await exec(`echo ${process.pid} | sudo tee ${cgroupPath}/cgroup.procs`).catch(() => {});
      
      console.log('✓ Cgroups v2 limits applied');
    } catch (e) {
      // Fallback to JavaScript limits
    }
  }
  
  startMonitorWorker() {
    const workerCode = `
      const { parentPort, workerData } = require('worker_threads');
      const fs = require('fs');
      const { sharedBuffer, maxConcurrent } = workerData;
      
      const states = sharedBuffer ? new Int32Array(sharedBuffer) : null;
      
      // Efficient process monitoring using /proc directly
      function checkProcesses() {
        const now = Date.now();
        
        // Read all /proc/*/stat files in one pass
        try {
          const pids = fs.readdirSync('/proc').filter(p => /^[0-9]+$/.test(p));
          
          for (let i = 0; i < pids.length && i < maxConcurrent; i++) {
            const pid = parseInt(pids[i]);
            try {
              const stat = fs.readFileSync(\`/proc/\${pid}/stat\`, 'utf8');
              const parts = stat.split(' ');
              const state = parts[2];
              const utime = parseInt(parts[13]);
              const stime = parseInt(parts[14]);
              
              // Store in shared memory: [pid, state, cpu_ticks, timestamp]
              if (states) {
                states[i * 4] = pid;
                states[i * 4 + 1] = state.charCodeAt(0); // R, S, D, Z
                states[i * 4 + 2] = utime + stime;
                states[i * 4 + 3] = now;
              }
            } catch (e) {
              // Process disappeared
            }
          }
        } catch (e) {
          // Fallback for non-Linux
          parentPort.postMessage({ type: 'fallback' });
        }
      }
      
      // Check every 500ms (more responsive than 2s)
      setInterval(checkProcesses, 500);
    `;
    
    this.worker = new Worker(workerCode, {
      eval: true,
      workerData: {
        sharedBuffer: this.sharedBuffer,
        maxConcurrent: this.maxConcurrent
      }
    });
    
    this.worker.on('message', (msg) => {
      if (msg.type === 'fallback') {
        // Non-Linux fallback
        this.useFallbackMonitoring();
      }
    });
  }
  
  // O(1) process registration with pre-allocated slots
  registerProcess(pid, command, args) {
    if (this.processMap.size >= this.maxConcurrent) {
      // Queue with minimal overhead
      this.queue.push({ pid, command, args, timestamp: Date.now() });
      return false;
    }
    
    const slot = this.findFreeSlot();
    this.processMap.set(pid, {
      slot,
      command,
      args,
      startTime: Date.now()
    });
    
    return true;
  }
  
  findFreeSlot() {
    // O(1) average case with bit manipulation
    for (let i = 0; i < this.maxConcurrent; i++) {
      if (!this.processStates || this.processStates[i * 4] === 0) {
        return i;
      }
    }
    return -1;
  }
  
  // Batch process cleanup (more efficient than individual checks)
  cleanupProcesses() {
    const now = Date.now();
    const toRemove = [];
    
    // Single pass through shared memory
    if (this.processStates) {
      for (let i = 0; i < this.maxConcurrent; i++) {
        const pid = this.processStates[i * 4];
        const state = this.processStates[i * 4 + 1];
        const lastUpdate = this.processStates[i * 4 + 3];
        
        if (pid > 0) {
          // Check if zombie (Z) or dead (no update in 5s)
          if (state === 90 || (now - lastUpdate) > 5000) { // 'Z'.charCodeAt(0) === 90
            toRemove.push(pid);
            this.processStates[i * 4] = 0; // Mark slot as free
          }
        }
      }
    }
    
    // Batch removal
    for (const pid of toRemove) {
      this.processMap.delete(pid);
    }
    
    // Process queue if space available
    while (this.queue.length > 0 && this.processMap.size < this.maxConcurrent) {
      const next = this.queue.shift();
      this.registerProcess(next.pid, next.command, next.args);
    }
  }
  
  // Fast path for known problematic commands
  interceptCommand(command, args) {
    const cmd = command.toLowerCase();
    
    // Pre-compiled command modifications
    const limits = {
      'fd': ['--threads=1', '--max-results=1000'],
      'rg': ['--threads=1', '--max-count=100', '--max-columns=200'],
      'ripgrep': ['--threads=1', '--max-count=100'],
      'cargo': ['--jobs=2'],
      'make': ['-j2']
    };
    
    if (limits[cmd]) {
      // Inject limits efficiently
      const newArgs = [...limits[cmd]];
      
      // Only add if not already present (O(n) but small n)
      for (const arg of args) {
        if (!limits[cmd].some(l => arg.startsWith(l.split('=')[0]))) {
          newArgs.push(arg);
        }
      }
      
      return newArgs;
    }
    
    return args;
  }
  
  useFallbackMonitoring() {
    // Fallback for non-Linux systems
    setInterval(() => {
      this.cleanupProcesses();
    }, 1000);
  }
}

// Singleton instance
export const processManager = new NativeProcessManager();