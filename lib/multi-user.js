import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { logger } from './logger.js';

// Multi-user isolation and safety
export class MultiUserManager {
  constructor() {
    this.namespace = this.getNamespace();
    this.lockFile = `/var/run/claude-yolt/lock-${this.namespace}`;
    this.socketPath = `/var/run/claude-yolt/socket-${this.namespace}`;
  }

  getNamespace() {
    // Create namespace from user + optional team
    const user = process.env.USER || 'default';
    const team = process.env.CLAUDE_TEAM || '';
    const workspace = process.env.CLAUDE_WORKSPACE || process.cwd();
    
    // Hash workspace path for isolation
    const hash = crypto.createHash('sha256')
      .update(`${user}:${team}:${workspace}`)
      .digest('hex')
      .substring(0, 8);
    
    return `${user}-${hash}`;
  }

  async acquireLock() {
    const lockDir = path.dirname(this.lockFile);
    if (!fs.existsSync(lockDir)) {
      fs.mkdirSync(lockDir, { recursive: true, mode: 0o755 });
    }

    try {
      // Atomic lock creation
      fs.writeFileSync(this.lockFile, JSON.stringify({
        pid: process.pid,
        user: process.env.USER,
        started: new Date().toISOString(),
        workspace: process.cwd()
      }), { flag: 'wx', mode: 0o644 });
      
      logger.info('Lock acquired', { namespace: this.namespace });
      return true;
    } catch (err) {
      if (err.code === 'EEXIST') {
        // Check if lock is stale
        try {
          const lock = JSON.parse(fs.readFileSync(this.lockFile, 'utf8'));
          const isStale = !this.isProcessRunning(lock.pid);
          
          if (isStale) {
            logger.warn('Removing stale lock', { 
              namespace: this.namespace,
              stalePid: lock.pid 
            });
            fs.unlinkSync(this.lockFile);
            return this.acquireLock(); // Retry
          }
          
          logger.error('Lock already held', { 
            namespace: this.namespace,
            holder: lock 
          });
          return false;
        } catch (e) {
          logger.error('Invalid lock file', { error: e });
          return false;
        }
      }
      throw err;
    }
  }

  releaseLock() {
    try {
      fs.unlinkSync(this.lockFile);
      logger.info('Lock released', { namespace: this.namespace });
    } catch (err) {
      // Ignore if already released
    }
  }

  isProcessRunning(pid) {
    try {
      process.kill(pid, 0);
      return true;
    } catch (e) {
      return false;
    }
  }

  // Namespace-isolated paths
  getAuthPath() {
    return path.join(os.homedir(), '.claude-yolt', this.namespace, 'auth');
  }

  getLogPath() {
    return path.join('/var/log/claude-yolt', this.namespace);
  }

  getStatePath() {
    return path.join('/var/lib/claude-yolt', this.namespace);
  }

  // Team sharing with permissions
  async shareWithTeam(teamId, permissions = ['read']) {
    const sharePath = path.join(this.getStatePath(), '.shares', teamId);
    
    fs.mkdirSync(path.dirname(sharePath), { recursive: true });
    fs.writeFileSync(sharePath, JSON.stringify({
      teamId,
      permissions,
      sharedBy: process.env.USER,
      sharedAt: new Date().toISOString()
    }));
    
    logger.info('Shared with team', { teamId, permissions });
  }

  // Audit all actions for compliance
  auditAction(action, details) {
    const auditPath = path.join(this.getLogPath(), 'audit.jsonl');
    const entry = {
      timestamp: new Date().toISOString(),
      user: process.env.USER,
      namespace: this.namespace,
      action,
      details,
      pid: process.pid,
      hostname: os.hostname()
    };
    
    fs.appendFileSync(auditPath, JSON.stringify(entry) + '\n');
  }
}

// Process isolation using Linux namespaces (if available)
export function setupNamespaces() {
  if (process.platform !== 'linux') return;
  
  try {
    // Check if we have CAP_SYS_ADMIN
    const hasCapability = checkCapability('CAP_SYS_ADMIN');
    if (!hasCapability) {
      logger.info('Running without namespace isolation (no CAP_SYS_ADMIN)');
      return;
    }
    
    // Create new PID namespace for process isolation
    const { spawn } = require('child_process');
    const unshare = spawn('unshare', [
      '--pid',      // New PID namespace
      '--mount',    // New mount namespace
      '--ipc',      // New IPC namespace
      '--',
      process.argv[0], // node
      ...process.argv.slice(1)
    ]);
    
    unshare.on('exit', (code) => process.exit(code));
    process.exit(0); // Parent exits, child continues in namespace
  } catch (err) {
    logger.warn('Namespace setup failed', { error: err.message });
  }
}

function checkCapability(cap) {
  try {
    const caps = fs.readFileSync('/proc/self/status', 'utf8');
    const capLine = caps.split('\n').find(l => l.startsWith('CapEff:'));
    // This is simplified - real implementation would parse capability bits
    return false; // Safe default
  } catch (e) {
    return false;
  }
}