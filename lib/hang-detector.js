import { exec, execSync } from 'child_process';
import chalk from 'chalk';

// Simple hang detection focused on the real problem
export class HangDetector {
  constructor() {
    this.knownProcesses = new Map(); // pid -> { command, startTime, target }
    this.checkInterval = null;
  }
  
  start() {
    // Check every 2 seconds
    this.checkInterval = setInterval(() => this.checkHangs(), 2000);
  }
  
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
  
  trackProcess(pid, command, args) {
    // Extract target for fd/rg commands
    let target = null;
    if (command.includes('fd') || command.includes('rg')) {
      // Find the non-flag argument (the search target)
      target = args?.find(arg => arg && !arg.startsWith('-'));
    }
    
    this.knownProcesses.set(pid, {
      command,
      args,
      target,
      startTime: Date.now()
    });
  }
  
  untrackProcess(pid) {
    this.knownProcesses.delete(pid);
  }
  
  checkHangs() {
    const now = Date.now();
    
    for (const [pid, info] of this.knownProcesses.entries()) {
      const runtime = now - info.startTime;
      
      // Kill Rust tools if they take too long - they should be FAST
      if (info.command.includes('fd') && runtime > 10000) {
        this.killHungProcess(pid, info, runtime, 'fd');
      } else if (info.command.includes('rg') || info.command.includes('ripgrep') && runtime > 15000) {
        this.killHungProcess(pid, info, runtime, 'rg');
      } else if (info.command.includes('bat') && runtime > 5000) {
        // bat (cat replacement) should be instant
        this.killHungProcess(pid, info, runtime, 'bat');
      } else if (info.command.includes('exa') || info.command.includes('lsd') && runtime > 3000) {
        // ls replacements should be very fast
        this.killHungProcess(pid, info, runtime, 'exa/lsd');
      } else if (info.command.includes('dust') && runtime > 10000) {
        // dust (du replacement) can take time on large dirs but not forever
        this.killHungProcess(pid, info, runtime, 'dust');
      } else if (info.command.includes('procs') && runtime > 3000) {
        // procs (ps replacement) should be instant
        this.killHungProcess(pid, info, runtime, 'procs');
      } else if (info.command.includes('sd') && runtime > 5000) {
        // sd (sed replacement) should be fast
        this.killHungProcess(pid, info, runtime, 'sd');
      } else if (info.command.includes('hyperfine') && runtime > 600000) {
        // hyperfine (benchmarking) can legitimately run long, give it 10 min
        this.killHungProcess(pid, info, runtime, 'hyperfine');
      } else if (info.command.includes('tokei') && runtime > 30000) {
        // tokei (code counter) can take time on huge repos
        this.killHungProcess(pid, info, runtime, 'tokei');
      } else if (info.command.includes('delta') && runtime > 5000) {
        // delta (diff viewer) should be fast
        this.killHungProcess(pid, info, runtime, 'delta');
      }
    }
  }
  
  killHungProcess(pid, info, runtime, type) {
    try {
      // Quick CPU check
      const ps = execSync(`ps -p ${pid} -o %cpu= 2>/dev/null || echo -1`).toString();
      const cpu = parseFloat(ps.trim());
      
      if (cpu < 5.0) { // Low CPU = probably hung
        console.warn(chalk.red(`\n🚨 Killing hung ${type} process ${pid} (${Math.round(runtime/1000)}s, CPU: ${cpu}%)`));
        execSync(`kill -KILL ${pid} 2>/dev/null`);
        this.knownProcesses.delete(pid);
      }
    } catch (e) {
      // Process already dead
      this.knownProcesses.delete(pid);
    }
  }
  
  investigateFdHang(pid, info, runtime) {
    try {
      // Check if process still exists
      execSync(`kill -0 ${pid} 2>/dev/null`);
      
      // Get process state
      const stat = execSync(`cat /proc/${pid}/stat 2>/dev/null || echo ""`, { encoding: 'utf8' });
      const statParts = stat.split(' ');
      const state = statParts[2]; // Process state: R=running, S=sleeping, D=disk sleep, Z=zombie
      
      // Check CPU
      const ps = execSync(`ps -p ${pid} -o %cpu= 2>/dev/null || echo 0`).toString();
      const cpu = parseFloat(ps.trim());
      
      // Check what files/pipes it has open
      const fdInfo = execSync(`ls -la /proc/${pid}/fd 2>/dev/null || echo ""`, { encoding: 'utf8' });
      const openFiles = fdInfo.split('\n').filter(line => line.includes('->')).length;
      
      // Check if it's stuck in a system call
      let wchan = '';
      try {
        wchan = execSync(`cat /proc/${pid}/wchan 2>/dev/null`, { encoding: 'utf8' }).trim();
      } catch (e) {}
      
      if (cpu < 0.1 && runtime > 5000) {
        console.warn(chalk.red(`\n🚨 fd process ${pid} appears stuck:`));
        console.warn(chalk.yellow(`   State: ${state} (S=sleeping, D=uninterruptible disk sleep)`));
        console.warn(chalk.yellow(`   Runtime: ${Math.round(runtime/1000)}s with ${cpu}% CPU`));
        console.warn(chalk.yellow(`   Open file descriptors: ${openFiles}`));
        
        if (wchan && wchan !== '0') {
          console.warn(chalk.yellow(`   Waiting in kernel: ${wchan}`));
        }
        
        // Common hang scenarios:
        if (state === 'D') {
          console.warn(chalk.red(`   ⚠️  In uninterruptible disk sleep - likely NFS/network mount issue`));
        } else if (wchan.includes('pipe_wait') || wchan.includes('pipe_read')) {
          console.warn(chalk.red(`   ⚠️  Stuck waiting for pipe input`));
        } else if (wchan.includes('futex')) {
          console.warn(chalk.red(`   ⚠️  Stuck on mutex/lock`));
        }
        
        if (info.target) {
          console.warn(chalk.yellow(`   Target: "${info.target}"`));
        }
        
        console.warn(chalk.red(`   Killing hung fd process ${pid}`));
        try {
          execSync(`kill -KILL ${pid} 2>/dev/null`);
          this.knownProcesses.delete(pid);
        } catch (e) {}
      }
    } catch (e) {
      // Process doesn't exist anymore
      this.knownProcesses.delete(pid);
    }
  }
  
  investigateRgHang(pid, info, runtime) {
    try {
      execSync(`kill -0 ${pid} 2>/dev/null`);
      
      const ps = execSync(`ps -p ${pid} -o %cpu= 2>/dev/null || echo 0`).toString();
      const cpu = parseFloat(ps.trim());
      
      if (cpu < 0.1 && runtime > 10000) {
        console.warn(chalk.red(`\n🚨 rg stuck for ${Math.round(runtime/1000)}s (CPU: ${cpu}%)`));
        console.warn(chalk.red(`   Killing hung rg process ${pid}`));
        
        try {
          execSync(`kill -KILL ${pid} 2>/dev/null`);
          this.knownProcesses.delete(pid);
        } catch (e) {}
      }
    } catch (e) {
      this.knownProcesses.delete(pid);
    }
  }
}

// Global instance
export const hangDetector = new HangDetector();
hangDetector.start();