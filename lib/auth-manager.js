import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import chalk from 'chalk';

const AUTH_DIR = path.join(os.homedir(), '.claude-yolt', 'auth');
const AUTH_FILE = path.join(AUTH_DIR, 'tokens.enc');
const KEY_FILE = path.join(AUTH_DIR, '.key');
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

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

  getOrCreateKey() {
    if (fs.existsSync(KEY_FILE)) {
      return fs.readFileSync(KEY_FILE);
    }
    const key = crypto.randomBytes(32);
    fs.writeFileSync(KEY_FILE, key, { mode: 0o600 });
    return key;
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
      expiresAt: Date.now() + THIRTY_DAYS
    };
    
    const encrypted = this.encrypt(JSON.stringify(auth));
    fs.writeFileSync(AUTH_FILE, encrypted, { mode: 0o600 });
    
    console.log(chalk.green('✓ Auth saved for 30 days'));
  }

  loadAuth() {
    if (!fs.existsSync(AUTH_FILE)) {
      return null;
    }

    try {
      const encrypted = fs.readFileSync(AUTH_FILE, 'utf8');
      const auth = JSON.parse(this.decrypt(encrypted));
      
      // Check expiration
      if (Date.now() > auth.expiresAt) {
        console.log(chalk.yellow('⚠️  Saved auth expired'));
        fs.unlinkSync(AUTH_FILE);
        return null;
      }

      const daysLeft = Math.ceil((auth.expiresAt - Date.now()) / (24 * 60 * 60 * 1000));
      console.log(chalk.green(`✓ Auth loaded (${daysLeft} days remaining)`));
      
      return auth;
    } catch (e) {
      console.error(chalk.red('Failed to load auth:', e.message));
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