import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

/**
 * Security audit logging system for claude-yolt
 * Provides tamper-resistant logging of security events
 */

const AUDIT_DIR = path.join(os.homedir(), '.claude-yolt', 'audit');
const AUDIT_FILE = path.join(AUDIT_DIR, 'security.log');
const AUDIT_HASH_FILE = path.join(AUDIT_DIR, '.audit_hash');
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB

export class AuditLogger {
  constructor() {
    this.ensureAuditDir();
    this.rotateIfNeeded();
  }

  ensureAuditDir() {
    if (!fs.existsSync(AUDIT_DIR)) {
      fs.mkdirSync(AUDIT_DIR, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Log a security event with structured data
   * @param {string} eventType - Type of security event
   * @param {Object} data - Event data
   * @param {string} level - Log level (info, warning, error)
   */
  logSecurityEvent(eventType, data = {}, level = 'info') {
    const event = {
      timestamp: new Date().toISOString(),
      level,
      eventType,
      pid: process.pid,
      user: os.userInfo()?.username || 'unknown',
      cwd: process.cwd(),
      ...data
    };

    // Create a hash of the event for integrity
    const eventString = JSON.stringify(event);
    const eventHash = crypto.createHash('sha256').update(eventString).digest('hex');
    
    const logEntry = {
      ...event,
      hash: eventHash
    };

    try {
      this.writeLogEntry(JSON.stringify(logEntry) + '\n');
      this.updateIntegrityHash();
    } catch (error) {
      // Fallback to console if file logging fails
      console.error('[AUDIT] Failed to write audit log:', error.message);
      console.error('[AUDIT]', JSON.stringify(event));
    }
  }

  /**
   * Write log entry to audit file
   * @param {string} entry - Log entry to write
   */
  writeLogEntry(entry) {
    fs.appendFileSync(AUDIT_FILE, entry, { mode: 0o600 });
  }

  /**
   * Update integrity hash of the audit log
   */
  updateIntegrityHash() {
    try {
      if (fs.existsSync(AUDIT_FILE)) {
        const content = fs.readFileSync(AUDIT_FILE, 'utf8');
        const hash = crypto.createHash('sha256').update(content).digest('hex');
        fs.writeFileSync(AUDIT_HASH_FILE, hash, { mode: 0o600 });
      }
    } catch (error) {
      console.error('[AUDIT] Failed to update integrity hash:', error.message);
    }
  }

  /**
   * Verify integrity of audit log
   * @returns {boolean} True if log is intact
   */
  verifyIntegrity() {
    try {
      if (!fs.existsSync(AUDIT_FILE) || !fs.existsSync(AUDIT_HASH_FILE)) {
        return true; // No log to verify
      }

      const content = fs.readFileSync(AUDIT_FILE, 'utf8');
      const currentHash = crypto.createHash('sha256').update(content).digest('hex');
      const storedHash = fs.readFileSync(AUDIT_HASH_FILE, 'utf8').trim();

      return currentHash === storedHash;
    } catch (error) {
      console.error('[AUDIT] Failed to verify integrity:', error.message);
      return false;
    }
  }

  /**
   * Rotate audit log if it exceeds maximum size
   */
  rotateIfNeeded() {
    try {
      if (fs.existsSync(AUDIT_FILE)) {
        const stats = fs.statSync(AUDIT_FILE);
        if (stats.size > MAX_LOG_SIZE) {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const rotatedFile = path.join(AUDIT_DIR, `security-${timestamp}.log`);
          fs.renameSync(AUDIT_FILE, rotatedFile);
          
          // Compress rotated file if possible
          try {
            const zlib = require('zlib');
            const input = fs.readFileSync(rotatedFile);
            const compressed = zlib.gzipSync(input);
            fs.writeFileSync(rotatedFile + '.gz', compressed);
            fs.unlinkSync(rotatedFile);
          } catch (error) {
            // Compression failed, keep uncompressed
          }

          this.logSecurityEvent('audit_log_rotated', {
            rotatedFile: rotatedFile,
            originalSize: stats.size
          });
        }
      }
    } catch (error) {
      console.error('[AUDIT] Failed to rotate log:', error.message);
    }
  }

  /**
   * Get recent security events
   * @param {number} count - Number of recent events to retrieve
   * @returns {Array} Recent security events
   */
  getRecentEvents(count = 100) {
    try {
      if (!fs.existsSync(AUDIT_FILE)) {
        return [];
      }

      const content = fs.readFileSync(AUDIT_FILE, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      
      return lines
        .slice(-count)
        .map(line => {
          try {
            return JSON.parse(line);
          } catch (error) {
            return { error: 'Failed to parse log entry', raw: line };
          }
        });
    } catch (error) {
      console.error('[AUDIT] Failed to read events:', error.message);
      return [];
    }
  }

  /**
   * Get security statistics
   * @returns {Object} Security statistics
   */
  getSecurityStats() {
    const events = this.getRecentEvents(1000);
    const stats = {
      totalEvents: events.length,
      eventTypes: {},
      levels: { info: 0, warning: 0, error: 0 },
      integrityOk: this.verifyIntegrity(),
      lastEvent: events.length > 0 ? events[events.length - 1].timestamp : null
    };

    events.forEach(event => {
      if (event.eventType) {
        stats.eventTypes[event.eventType] = (stats.eventTypes[event.eventType] || 0) + 1;
      }
      if (event.level && stats.levels.hasOwnProperty(event.level)) {
        stats.levels[event.level]++;
      }
    });

    return stats;
  }

  /**
   * Log command execution events
   * @param {string} command - Command being executed
   * @param {Array} args - Command arguments
   * @param {Object} validation - Validation result
   */
  logCommandExecution(command, args = [], validation = {}) {
    this.logSecurityEvent('command_execution', {
      command,
      args: args.slice(0, 5), // Log first 5 args only
      allowed: validation.allowed,
      reason: validation.reason,
      sanitized: validation.sanitizedArgs ? validation.sanitizedArgs.length !== args.length : false
    }, validation.allowed ? 'info' : 'error');
  }

  /**
   * Log permission bypass attempts
   * @param {string} operation - Operation being bypassed
   * @param {Object} context - Context information
   */
  logPermissionBypass(operation, context = {}) {
    this.logSecurityEvent('permission_bypass', {
      operation,
      ...context
    }, 'warning');
  }

  /**
   * Log authentication events
   * @param {string} event - Auth event type
   * @param {Object} context - Event context
   */
  logAuthEvent(event, context = {}) {
    this.logSecurityEvent('authentication', {
      authEvent: event,
      ...context
    }, event.includes('failed') ? 'error' : 'info');
  }

  /**
   * Log system integrity events
   * @param {string} event - Integrity event type
   * @param {Object} context - Event context
   */
  logIntegrityEvent(event, context = {}) {
    this.logSecurityEvent('system_integrity', {
      integrityEvent: event,
      ...context
    }, 'warning');
  }
}

// Global audit logger instance
export const auditLogger = new AuditLogger();

// Log system startup
auditLogger.logSecurityEvent('system_startup', {
  nodeVersion: process.version,
  platform: os.platform(),
  arch: os.arch(),
  args: process.argv
});

// Cleanup on exit
process.on('exit', () => {
  auditLogger.logSecurityEvent('system_shutdown', {
    uptime: process.uptime()
  });
});

process.on('SIGINT', () => {
  auditLogger.logSecurityEvent('system_interrupt', {
    signal: 'SIGINT'
  });
  process.exit(0);
});

process.on('SIGTERM', () => {
  auditLogger.logSecurityEvent('system_interrupt', {
    signal: 'SIGTERM'
  });
  process.exit(0);
});