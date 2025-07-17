import path from 'path';

/**
 * Command validation and sanitization for preventing command injection
 * Implements allowlist-based approach for secure command execution
 */

// Safe commands that are allowed by default
const ALLOWED_COMMANDS = new Set([
  // System utilities
  'ls', 'cat', 'echo', 'pwd', 'which', 'whereis',
  'head', 'tail', 'wc', 'sort', 'uniq', 'cut',
  
  // Git operations
  'git',
  
  // Development tools
  'node', 'npm', 'yarn', 'pnpm', 'deno',
  'python', 'python3', 'pip', 'pip3',
  'cargo', 'rustc', 'rust-analyzer',
  
  // Search and find tools
  'find', 'grep', 'fd', 'rg', 'ripgrep',
  'ag', 'ack',
  
  // Text editors (view mode)
  'vi', 'vim', 'nano', 'emacs',
  
  // Compilers and interpreters
  'gcc', 'clang', 'javac', 'tsc',
  
  // Package managers
  'apt', 'brew', 'chocolatey', 'winget'
]);

// Commands that require elevated privileges (logged but allowed)
const PRIVILEGED_COMMANDS = new Set([
  'sudo', 'su', 'chmod', 'chown', 'chgrp',
  'systemctl', 'service', 'mount', 'umount'
]);

// Commands that are explicitly blocked for security
const BLOCKED_COMMANDS = new Set([
  'rm', 'rmdir', 'del', 'rd',  // File deletion
  'format', 'fdisk', 'mkfs',   // Disk operations
  'shutdown', 'reboot', 'halt', // System control
  'kill', 'killall', 'pkill',  // Process termination
  'dd', 'shred',               // Data destruction
  'nc', 'netcat', 'telnet',    // Network tools
  'wget', 'curl',              // Network downloads (use with caution)
  'ssh', 'scp', 'rsync'        // Remote access
]);

// Dangerous argument patterns
const DANGEROUS_PATTERNS = [
  /[;&|`$(){}]/,           // Command injection characters
  /\.\.[\/\\]/,            // Path traversal
  /\/etc\/passwd/,         // System files
  /\/proc\//,              // Process filesystem
  /\/dev\//,               // Device files
  /--?\s*eval/,            // Eval flags
  /--?\s*exec/,            // Exec flags
  /<\s*\(/,                // Process substitution
  />\s*&/                  // File descriptor redirection
];

export class CommandValidator {
  constructor(options = {}) {
    this.strictMode = options.strictMode || false;
    this.customAllowed = new Set(options.allowedCommands || []);
    this.customBlocked = new Set(options.blockedCommands || []);
  }

  /**
   * Validate a command and its arguments
   * @param {string} command - The command to execute
   * @param {Array} args - Command arguments
   * @param {Object} options - Execution options
   * @returns {Object} Validation result
   */
  validateCommand(command, args = [], options = {}) {
    const result = {
      allowed: false,
      reason: '',
      sanitizedArgs: [...args],
      warnings: [],
      auditLevel: 'info'
    };

    // Extract base command name
    const baseCommand = path.basename(command).toLowerCase();
    
    // Check if command is explicitly blocked
    if (BLOCKED_COMMANDS.has(baseCommand) || this.customBlocked.has(baseCommand)) {
      result.reason = `Command '${baseCommand}' is explicitly blocked for security`;
      result.auditLevel = 'error';
      // auditLogger.logSecurityEvent('command_blocked', {
      //   command: baseCommand,
      //   args: args.slice(0, 3), // Log first 3 args only
      //   reason: result.reason
      // });
      return result;
    }

    // Check if command is in allowed list
    const isAllowed = ALLOWED_COMMANDS.has(baseCommand) || this.customAllowed.has(baseCommand);
    const isPrivileged = PRIVILEGED_COMMANDS.has(baseCommand);
    
    if (!isAllowed && !isPrivileged && this.strictMode) {
      result.reason = `Command '${baseCommand}' not in allowlist (strict mode)`;
      result.auditLevel = 'warning';
      // auditLogger.logSecurityEvent('command_not_allowed', {
      //   command: baseCommand,
      //   args: args.slice(0, 3),
      //   strictMode: true
      // });
      return result;
    }

    // Validate arguments for dangerous patterns
    const argValidation = this.validateArguments(args);
    if (!argValidation.safe) {
      result.reason = `Dangerous patterns detected in arguments: ${argValidation.violations.join(', ')}`;
      result.auditLevel = 'error';
      // auditLogger.logSecurityEvent('dangerous_arguments', {
      //   command: baseCommand,
      //   violations: argValidation.violations,
      //   args: args.slice(0, 3)
      // });
      return result;
    }

    // Apply argument sanitization
    result.sanitizedArgs = this.sanitizeArguments(args);

    // Log privileged command usage
    if (isPrivileged) {
      result.warnings.push(`Using privileged command: ${baseCommand}`);
      result.auditLevel = 'warning';
      // auditLogger.logSecurityEvent('privileged_command', {
      //   command: baseCommand,
      //   args: args.slice(0, 3)
      // });
    }

    // Command is allowed
    result.allowed = true;
    result.reason = 'Command validation passed';
    
    // auditLogger.logSecurityEvent('command_validated', {
    //   command: baseCommand,
    //   args: args.slice(0, 3),
    //   sanitized: result.sanitizedArgs.length !== args.length
    // });

    return result;
  }

  /**
   * Validate command arguments for dangerous patterns
   * @param {Array} args - Arguments to validate
   * @returns {Object} Validation result
   */
  validateArguments(args) {
    const violations = [];
    
    for (const arg of args) {
      if (typeof arg !== 'string') continue;
      
      for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.test(arg)) {
          violations.push(`Pattern ${pattern} in argument: ${arg.substring(0, 50)}`);
        }
      }
    }

    return {
      safe: violations.length === 0,
      violations
    };
  }

  /**
   * Sanitize command arguments
   * @param {Array} args - Arguments to sanitize
   * @returns {Array} Sanitized arguments
   */
  sanitizeArguments(args) {
    return args.map(arg => {
      if (typeof arg !== 'string') return arg;
      
      // Remove null bytes
      let sanitized = arg.replace(/\0/g, '');
      
      // Escape dangerous shell characters
      sanitized = sanitized.replace(/[;&|`$(){}]/g, '\\$&');
      
      // Limit argument length
      if (sanitized.length > 1000) {
        sanitized = sanitized.substring(0, 1000);
      }
      
      return sanitized;
    });
  }

  /**
   * Get command validation statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      allowedCommands: ALLOWED_COMMANDS.size + this.customAllowed.size,
      blockedCommands: BLOCKED_COMMANDS.size + this.customBlocked.size,
      privilegedCommands: PRIVILEGED_COMMANDS.size,
      dangerousPatterns: DANGEROUS_PATTERNS.length,
      strictMode: this.strictMode
    };
  }
}

// Global validator instance
export const commandValidator = new CommandValidator({
  strictMode: process.env.CLAUDE_STRICT_COMMANDS === 'true'
});

/**
 * Convenience function for quick command validation
 * @param {string} command - Command to validate
 * @param {Array} args - Command arguments  
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
export function validateCommand(command, args = [], options = {}) {
  return commandValidator.validateCommand(command, args, options);
}