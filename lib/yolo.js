#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

// ANSI color codes
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

// Debug logging function
const debug = (message) => {
  if (process.env.DEBUG) {
    console.log(message);
  }
};

// Get the directory of the current module
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Find node_modules directory
let nodeModulesDir = path.resolve(__dirname, '..');
while (!fs.existsSync(path.join(nodeModulesDir, 'node_modules')) && nodeModulesDir !== '/') {
  nodeModulesDir = path.resolve(nodeModulesDir, '..');
}

// Find Claude installation
export function findClaudeInstallation() {
  // Try global installation first
  let globalClaudeDir;
  try {
    const globalNodeModules = execSync('npm -g root').toString().trim();
    const potentialGlobalDir = path.join(globalNodeModules, '@anthropic-ai', 'claude-code');
    
    if (fs.existsSync(potentialGlobalDir)) {
      globalClaudeDir = potentialGlobalDir;
      debug(`Found global Claude installation at: ${globalClaudeDir}`);
    }
  } catch (error) {
    debug(`Error finding global Claude installation: ${error.message}`);
  }

  // Path to local installation
  const localClaudeDir = path.join(nodeModulesDir, 'node_modules', '@anthropic-ai', 'claude-code');
  
  // Prioritize global installation
  const claudeDir = globalClaudeDir || localClaudeDir;
  debug(`Using Claude installation from: ${claudeDir}`);
  
  // Check for both .js and .mjs versions
  let mjs = path.join(claudeDir, 'cli.mjs');
  let js = path.join(claudeDir, 'cli.js');
  let originalCliPath;
  let yoloCliPath;
  
  if (fs.existsSync(js)) {
    originalCliPath = js;
    yoloCliPath = path.join(claudeDir, 'cli-yolo.js');
  } else if (fs.existsSync(mjs)) {
    originalCliPath = mjs;
    yoloCliPath = path.join(claudeDir, 'cli-yolo.mjs');
  } else {
    throw new Error(`Claude CLI not found in ${claudeDir}. Make sure @anthropic-ai/claude-code is installed.`);
  }
  
  return { claudeDir, originalCliPath, yoloCliPath, isLocal: claudeDir === localClaudeDir };
}

// Modify Claude CLI for YOLO mode
export function modifyClaudeForYolo(originalCliPath, yoloCliPath, isLocal) {
  // Read the original CLI file
  let cliContent = fs.readFileSync(originalCliPath, 'utf8');
  
  if (isLocal) {
    cliContent = cliContent.replace(/"punycode"/g, '"punycode/"');
    debug('Replaced all instances of "punycode" with "punycode/"');
  }
  
  // Replace getIsDocker() calls with true
  cliContent = cliContent.replace(/[a-zA-Z0-9_]*\.getIsDocker\(\)/g, 'true');
  debug("Replaced all instances of *.getIsDocker() with true");
  
  // Replace hasInternetAccess() calls with false
  cliContent = cliContent.replace(/[a-zA-Z0-9_]*\.hasInternetAccess\(\)/g, 'false');
  debug("Replaced all instances of *.hasInternetAccess() with false");
  
  // Replace loading messages with YOLO versions
  const originalArray = '["Accomplishing","Actioning","Actualizing","Baking","Brewing","Calculating","Cerebrating","Churning","Clauding","Coalescing","Cogitating","Computing","Conjuring","Considering","Cooking","Crafting","Creating","Crunching","Deliberating","Determining","Doing","Effecting","Finagling","Forging","Forming","Generating","Hatching","Herding","Honking","Hustling","Ideating","Inferring","Manifesting","Marinating","Moseying","Mulling","Mustering","Musing","Noodling","Percolating","Pondering","Processing","Puttering","Reticulating","Ruminating","Schlepping","Shucking","Simmering","Smooshing","Spinning","Stewing","Synthesizing","Thinking","Transmuting","Vibing","Working"]';
  const yoloSuffixes = [
    ` ${RED}(safety's off, hold on tight)${RESET}`,
    ` ${YELLOW}(all gas, no brakes, lfg)${RESET}`,
    ` ${BOLD}\x1b[35m(yolo mode engaged)${RESET}`,
    ` ${CYAN}(dangerous mode! I guess you can just do things)${RESET}`
  ];
  
  const addYoloSuffixes = (arrayStr) => {
    try {
      const array = JSON.parse(arrayStr);
      const yoloArray = array.map(word => {
        const randomSuffix = yoloSuffixes[Math.floor(Math.random() * yoloSuffixes.length)];
        return word + randomSuffix;
      });
      return JSON.stringify(yoloArray);
    } catch (e) {
      debug(`Error modifying loading messages: ${e.message}`);
      return arrayStr;
    }
  };
  
  cliContent = cliContent.replace(originalArray, addYoloSuffixes(originalArray));
  debug("Replaced loading messages with YOLO versions");
  
  // Write the modified content
  fs.writeFileSync(yoloCliPath, cliContent);
  debug(`Created modified CLI at ${yoloCliPath}`);
  
  return yoloCliPath;
}

// Check for Claude updates
export async function checkForClaudeUpdates() {
  try {
    debug("Checking for Claude package updates...");
    
    // Get the latest version
    const latestVersion = execSync("npm view @anthropic-ai/claude-code version").toString().trim();
    debug(`Latest Claude version: ${latestVersion}`);
    
    const packageJsonPath = path.join(nodeModulesDir, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const currentVersion = packageJson.dependencies?.['@anthropic-ai/claude-code'];
    
    if (currentVersion !== "latest" && currentVersion !== latestVersion) {
      console.log(`Updating Claude from ${currentVersion || 'unknown'} to ${latestVersion}...`);
      packageJson.dependencies['@anthropic-ai/claude-code'] = latestVersion;
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
      execSync("npm install", { stdio: 'inherit', cwd: nodeModulesDir });
      console.log("Update complete!");
    }
  } catch (error) {
    debug(`Error checking for updates: ${error.message}`);
  }
}

// Main YOLO activation
export async function activateYoloMode() {
  console.log(`${YELLOW}🔥 YOLO MODE ACTIVATED 🔥${RESET}`);
  
  // Add the flag to arguments
  process.argv.splice(2, 0, '--dangerously-skip-permissions');
  debug("Added --dangerously-skip-permissions flag");
}