import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import chalk from 'chalk';
import { auditLogger } from './security/audit-logger.js';

const AUTH_DIR = path.join(os.homedir(), '.claude-yolt', 'auth');
const AUTH_FILE = path.join(AUTH_DIR, 'tokens.enc');
const KEY_FILE = path.join(AUTH_DIR, '.key');
const FORTY_FIVE_DAYS = 45 * 24 * 60 * 60 * 1000;

export class AuthManager {
  constructor() {
    this.ensureAuthDir();
    this.key = this.getOrCreateKey();
  }

  ensureAuthDir() {
    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true, mode: 0o700 });
    }
  }

  // SECURITY FIX: Secure key generation and storage
  getOrCreateKey() {
    if (fs.existsSync(KEY_FILE)) {
      try {
        const keyData = fs.readFileSync(KEY_FILE);
        // Verify key is valid length for AES-256
        if (keyData.length === 32) {
          auditLogger.logAuthEvent('key_loaded', { keyFile: KEY_FILE });
          return keyData;
        } else {
          auditLogger.logAuthEvent('key_invalid_length', { 
            keyFile: KEY_FILE, 
            length: keyData.length 
          });
        }
      } catch (error) {
        auditLogger.logAuthEvent('key_load_failed', { 
          keyFile: KEY_FILE, 
          error: error.message 
        });
      }
    }
    
    // Generate new secure key
    const key = crypto.randomBytes(32);
    
    try {
      // Write key with secure permissions
      fs.writeFileSync(KEY_FILE, key, { mode: 0o600 });
      
      // Verify file permissions
      const stats = fs.statSync(KEY_FILE);
      const mode = stats.mode & parseInt('777', 8);
      if (mode !== parseInt('600', 8)) {
        console.warn(chalk.yellow('⚠️  Warning: Key file permissions may be insecure'));
        auditLogger.logAuthEvent('key_permissions_warning', { 
          keyFile: KEY_FILE,
          permissions: mode.toString(8)
        });
      }
      
      auditLogger.logAuthEvent('key_created', { keyFile: KEY_FILE });
      return key;
    } catch (error) {
      auditLogger.logAuthEvent('key_creation_failed', { 
        keyFile: KEY_FILE, 
        error: error.message 
      });
      throw new Error(`Failed to create secure key: ${error.message}`);
    }
  }

  encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  decrypt(text) {
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  saveAuth(apiKey, sessionToken = null) {
    const auth = {
      apiKey,
      sessionToken,
      savedAt: Date.now(),
      expiresAt: Date.now() + FORTY_FIVE_DAYS
    };
    
    try {
      const encrypted = this.encrypt(JSON.stringify(auth));
      fs.writeFileSync(AUTH_FILE, encrypted, { mode: 0o600 });
      
      auditLogger.logAuthEvent('auth_saved', { 
        hasApiKey: !!apiKey,
        hasSessionToken: !!sessionToken,
        expiresAt: auth.expiresAt
      });
      
      console.log(chalk.green('✓ Auth saved securely for 45 days'));
    } catch (error) {
      auditLogger.logAuthEvent('auth_save_failed', { 
        error: error.message 
      });
      throw new Error(`Failed to save auth: ${error.message}`);
    }
  }

  loadAuth() {
    if (!fs.existsSync(AUTH_FILE)) {
      return null;
    }

    try {
      // Verify file permissions first
      const stats = fs.statSync(AUTH_FILE);
      const mode = stats.mode & parseInt('777', 8);
      if (mode !== parseInt('600', 8)) {
        auditLogger.logAuthEvent('auth_file_permissions_warning', { 
          authFile: AUTH_FILE,
          permissions: mode.toString(8)
        });
      }
      
      const encrypted = fs.readFileSync(AUTH_FILE, 'utf8');
      const auth = JSON.parse(this.decrypt(encrypted));
      
      // Check expiration
      if (Date.now() > auth.expiresAt) {
        console.log(chalk.yellow('⚠️  Saved auth expired'));
        fs.unlinkSync(AUTH_FILE);
        auditLogger.logAuthEvent('auth_expired', { 
          authFile: AUTH_FILE,
          expiresAt: auth.expiresAt
        });
        return null;
      }

      const daysLeft = Math.ceil((auth.expiresAt - Date.now()) / (24 * 60 * 60 * 1000));
      console.log(chalk.green(`✓ Auth loaded securely (${daysLeft} days remaining)`));
      
      auditLogger.logAuthEvent('auth_loaded', { 
        daysRemaining: daysLeft,
        hasApiKey: !!auth.apiKey,
        hasSessionToken: !!auth.sessionToken
      });
      
      return auth;
    } catch (e) {
      console.error(chalk.red('Failed to load auth:', e.message));
      auditLogger.logAuthEvent('auth_load_failed', { 
        error: e.message,
        authFile: AUTH_FILE
      });
      return null;
    }
  }

  // Auto-inject auth into environment
  injectAuth() {
    const auth = this.loadAuth();
    if (auth) {
      process.env.ANTHROPIC_API_KEY = auth.apiKey;
      if (auth.sessionToken) {
        process.env.CLAUDE_SESSION_TOKEN = auth.sessionToken;
      }
      return true;
    }
    return false;
  }

  // Watch for new auth in Claude's config
  watchForAuth() {
    const claudeConfigPaths = [
      path.join(os.homedir(), '.config', 'claude', 'config.json'),
      path.join(os.homedir(), '.claude', 'config.json'),
      path.join(os.homedir(), '.anthropic', 'claude.json')
    ];

    for (const configPath of claudeConfigPaths) {
      if (fs.existsSync(configPath)) {
        fs.watchFile(configPath, (curr, prev) => {
          if (curr.mtime > prev.mtime) {
            this.extractAndSaveAuth(configPath);
          }
        });
      }
    }
  }

  extractAndSaveAuth(configPath) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.apiKey || config.api_key) {
        this.saveAuth(config.apiKey || config.api_key, config.sessionToken);
        console.log(chalk.green('✓ Auto-captured auth from Claude config'));
      }
    } catch (e) {
      // Ignore parse errors
    }
  }
}

// Global instance
export const authManager = new AuthManager();

// Auto-inject on import
authManager.injectAuth();
authManager.watchForAuth();