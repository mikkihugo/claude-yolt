import fs from 'fs';
import path from 'path';
import os from 'os';
import { auditLogger } from './audit-logger.js';

/**
 * Secure permission manager for claude-yolt
 * Replaces the dangerous complete permission bypass with granular controls
 */

const PERMISSIONS_CONFIG = path.join(os.homedir(), '.claude-yolt', 'permissions.json');

// Default permission configuration
const DEFAULT_PERMISSIONS = {
  // File system permissions
  fileSystem: {
    readOnly: true,           // Allow read operations
    writeRestricted: true,    // Allow writes only to safe directories
    executeRestricted: true,  // Allow execution only of safe commands
    safeDirectories: [        // Directories where writes are allowed
      path.join(os.homedir(), 'Documents'),
      path.join(os.homedir(), 'Downloads'),
      path.join(os.homedir(), 'Desktop'),
      '/tmp',
      process.cwd() // Current working directory
    ],
    restrictedDirectories: [  // Directories that are forbidden
      '/etc',
      '/usr/bin',
      '/usr/sbin',
      '/bin',
      '/sbin',
      '/var/lib',
      '/var/log',
      '/proc',
      '/sys',
      '/dev'
    ]
  },
  
  // Network permissions
  network: {
    allowOutbound: false,     // Block outbound connections by default
    allowInbound: false,      // Block inbound connections
    allowedHosts: [           // Whitelist of allowed hosts
      'api.anthropic.com',
      'localhost',
      '127.0.0.1'
    ],
    allowedPorts: [80, 443]   // Allowed ports
  },
  
  // Process permissions
  processes: {
    allowSpawn: true,         // Allow spawning new processes
    maxProcesses: 50,         // Maximum concurrent processes
    allowedCommands: [        // Commands that bypass normal validation
      'git', 'npm', 'node', 'python', 'cargo'
    ],
    blockSystemCommands: true // Block system administration commands
  },
  
  // Docker and container permissions
  container: {
    forceDockerMode: false,   // Don't force docker mode
    allowContainerEscape: false, // Block container escape attempts
    requireIsolation: true    // Require process isolation
  }
};

export class PermissionManager {
  constructor() {
    this.permissions = this.loadPermissions();
    this.setupPermissionWatching();
  }

  /**
   * Load permissions configuration
   * @returns {Object} Permissions configuration
   */
  loadPermissions() {
    try {
      if (fs.existsSync(PERMISSIONS_CONFIG)) {
        const config = JSON.parse(fs.readFileSync(PERMISSIONS_CONFIG, 'utf8'));
        // Merge with defaults to ensure all fields exist
        return this.mergeWithDefaults(config);
      }
    } catch (error) {
      auditLogger.logSecurityEvent('permission_config_error', {
        error: error.message,
        config: PERMISSIONS_CONFIG
      });
    }
    
    // Return defaults and save them
    this.savePermissions(DEFAULT_PERMISSIONS);
    return { ...DEFAULT_PERMISSIONS };
  }

  /**
   * Save permissions configuration
   * @param {Object} permissions - Permissions to save
   */
  savePermissions(permissions) {
    try {
      const dir = path.dirname(PERMISSIONS_CONFIG);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      }
      
      fs.writeFileSync(PERMISSIONS_CONFIG, JSON.stringify(permissions, null, 2), { mode: 0o600 });
      
      auditLogger.logSecurityEvent('permission_config_saved', {
        config: PERMISSIONS_CONFIG
      });
    } catch (error) {
      auditLogger.logSecurityEvent('permission_config_save_error', {
        error: error.message,
        config: PERMISSIONS_CONFIG
      });
    }
  }

  /**
   * Merge configuration with defaults
   * @param {Object} config - User configuration
   * @returns {Object} Merged configuration
   */
  mergeWithDefaults(config) {
    const merged = { ...DEFAULT_PERMISSIONS };
    
    // Deep merge each section
    for (const [section, values] of Object.entries(config)) {
      if (merged[section] && typeof values === 'object') {
        merged[section] = { ...merged[section], ...values };
      } else {
        merged[section] = values;
      }
    }
    
    return merged;
  }

  /**
   * Check if Docker mode should be enabled
   * @returns {boolean} True if Docker mode is allowed
   */
  getIsDocker() {
    const result = this.permissions.container?.forceDockerMode || false;
    
    auditLogger.logPermissionBypass('docker_check', {
      allowed: result,
      forced: this.permissions.container?.forceDockerMode
    });
    
    return result;
  }

  /**
   * Check if internet access should be allowed
   * @returns {boolean} True if internet access is allowed
   */
  hasInternetAccess() {
    const result = this.permissions.network?.allowOutbound || false;
    
    auditLogger.logPermissionBypass('internet_access_check', {
      allowed: result,
      outbound: this.permissions.network?.allowOutbound,
      allowedHosts: this.permissions.network?.allowedHosts?.length || 0
    });
    
    return result;
  }

  /**
   * Check if a file path is safe for access
   * @param {string} filePath - Path to check
   * @param {string} operation - Operation type (read/write/execute)
   * @returns {Object} Permission result
   */
  checkFileAccess(filePath, operation = 'read') {
    const resolvedPath = path.resolve(filePath);
    const result = {
      allowed: false,
      reason: '',
      path: resolvedPath
    };

    // Check if path is in restricted directories
    const isRestricted = this.permissions.fileSystem.restrictedDirectories.some(dir =>
      resolvedPath.startsWith(path.resolve(dir))
    );

    if (isRestricted) {
      result.reason = `Access to restricted directory: ${resolvedPath}`;
      auditLogger.logSecurityEvent('file_access_denied', {
        path: resolvedPath,
        operation,
        reason: 'restricted_directory'
      });
      return result;
    }

    // Check operation-specific permissions
    switch (operation) {
      case 'read':
        if (this.permissions.fileSystem.readOnly) {
          result.allowed = true;
          result.reason = 'Read operation allowed';
        }
        break;
        
      case 'write':
        if (this.permissions.fileSystem.writeRestricted) {
          const isSafeDir = this.permissions.fileSystem.safeDirectories.some(dir =>
            resolvedPath.startsWith(path.resolve(dir))
          );
          
          if (isSafeDir) {
            result.allowed = true;
            result.reason = 'Write to safe directory allowed';
          } else {
            result.reason = 'Write not allowed outside safe directories';
          }
        }
        break;
        
      case 'execute':
        if (this.permissions.fileSystem.executeRestricted) {
          const isExecutable = this.permissions.processes.allowedCommands.some(cmd =>
            resolvedPath.includes(cmd)
          );
          
          if (isExecutable) {
            result.allowed = true;
            result.reason = 'Execution of allowed command';
          } else {
            result.reason = 'Execution not allowed for this file';
          }
        }
        break;
    }

    auditLogger.logSecurityEvent('file_access_check', {
      path: resolvedPath,
      operation,
      allowed: result.allowed,
      reason: result.reason
    });

    return result;
  }

  /**
   * Check if a network connection is allowed
   * @param {string} host - Target host
   * @param {number} port - Target port
   * @param {string} direction - 'inbound' or 'outbound'
   * @returns {Object} Permission result
   */
  checkNetworkAccess(host, port, direction = 'outbound') {
    const result = {
      allowed: false,
      reason: '',
      host,
      port,
      direction
    };

    const networkPerms = this.permissions.network;
    
    // Check direction permission
    const directionAllowed = direction === 'outbound' ? 
      networkPerms.allowOutbound : networkPerms.allowInbound;
    
    if (!directionAllowed) {
      result.reason = `${direction} connections not allowed`;
      return result;
    }

    // Check host allowlist
    if (networkPerms.allowedHosts && !networkPerms.allowedHosts.includes(host)) {
      result.reason = `Host ${host} not in allowlist`;
      return result;
    }

    // Check port allowlist
    if (networkPerms.allowedPorts && !networkPerms.allowedPorts.includes(port)) {
      result.reason = `Port ${port} not in allowlist`;
      return result;
    }

    result.allowed = true;
    result.reason = 'Network access allowed';

    auditLogger.logSecurityEvent('network_access_check', {
      host,
      port,
      direction,
      allowed: result.allowed,
      reason: result.reason
    });

    return result;
  }

  /**
   * Update permissions configuration
   * @param {Object} newPermissions - New permissions to apply
   */
  updatePermissions(newPermissions) {
    const oldPermissions = { ...this.permissions };
    this.permissions = this.mergeWithDefaults(newPermissions);
    this.savePermissions(this.permissions);

    auditLogger.logSecurityEvent('permissions_updated', {
      oldPermissions: Object.keys(oldPermissions),
      newPermissions: Object.keys(this.permissions)
    });
  }

  /**
   * Get current permissions summary
   * @returns {Object} Permissions summary
   */
  getPermissionsSummary() {
    return {
      fileSystem: {
        readOnly: this.permissions.fileSystem.readOnly,
        writeRestricted: this.permissions.fileSystem.writeRestricted,
        safeDirectories: this.permissions.fileSystem.safeDirectories.length,
        restrictedDirectories: this.permissions.fileSystem.restrictedDirectories.length
      },
      network: {
        outbound: this.permissions.network.allowOutbound,
        inbound: this.permissions.network.allowInbound,
        allowedHosts: this.permissions.network.allowedHosts.length,
        allowedPorts: this.permissions.network.allowedPorts.length
      },
      processes: {
        maxProcesses: this.permissions.processes.maxProcesses,
        allowedCommands: this.permissions.processes.allowedCommands.length,
        blockSystem: this.permissions.processes.blockSystemCommands
      },
      container: {
        forceDocker: this.permissions.container.forceDockerMode,
        allowEscape: this.permissions.container.allowContainerEscape,
        requireIsolation: this.permissions.container.requireIsolation
      }
    };
  }

  /**
   * Set up file watching for permission changes
   */
  setupPermissionWatching() {
    if (fs.existsSync(PERMISSIONS_CONFIG)) {
      fs.watchFile(PERMISSIONS_CONFIG, (curr, prev) => {
        if (curr.mtime > prev.mtime) {
          auditLogger.logSecurityEvent('permission_config_changed', {
            config: PERMISSIONS_CONFIG,
            mtime: curr.mtime
          });
          this.permissions = this.loadPermissions();
        }
      });
    }
  }
}

// Global permission manager instance
export const permissionManager = new PermissionManager();

/**
 * Replacement functions for the dangerous permission bypass
 * These provide controlled, audited permission checking
 */

/**
 * Secure replacement for getIsDocker() bypass
 * @returns {boolean} Whether Docker mode should be enabled
 */
export function getIsDocker() {
  return permissionManager.getIsDocker();
}

/**
 * Secure replacement for hasInternetAccess() bypass  
 * @returns {boolean} Whether internet access should be allowed
 */
export function hasInternetAccess() {
  return permissionManager.hasInternetAccess();
}

/**
 * Check file access permissions
 * @param {string} filePath - File path to check
 * @param {string} operation - Operation type
 * @returns {boolean} Whether access is allowed
 */
export function checkFileAccess(filePath, operation = 'read') {
  return permissionManager.checkFileAccess(filePath, operation).allowed;
}

/**
 * Check network access permissions
 * @param {string} host - Target host
 * @param {number} port - Target port
 * @param {string} direction - Connection direction
 * @returns {boolean} Whether access is allowed
 */
export function checkNetworkAccess(host, port, direction = 'outbound') {
  return permissionManager.checkNetworkAccess(host, port, direction).allowed;
}