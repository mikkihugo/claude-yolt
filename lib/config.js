import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_PATH = path.join(os.homedir(), '.claude-yolt', 'config.json');

const DEFAULT_CONFIG = {
  defaultMode: 'yolt', // yolo, yolt, airbag, router
  autoUpdate: true,
  safety: {
    maxMemMB: 4096,
    maxProcs: 50,
    cpuLimit: 1800,
    nice: 10
  },
  router: {
    preferLocal: true,
    preferredModels: ['local', 'ollama', 'github', 'claude'],
    localToolsFirst: true
  },
  yolo: {
    skipConsent: false,
    colorfulMessages: true
  }
};

export function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const userConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      return { ...DEFAULT_CONFIG, ...userConfig };
    }
  } catch (err) {
    console.warn(`Failed to load config: ${err.message}`);
  }
  return DEFAULT_CONFIG;
}

export function saveConfig(config) {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function getConfig() {
  return loadConfig();
}