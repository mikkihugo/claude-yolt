#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import chalk from 'chalk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log(chalk.cyan('\n🚀 Setting up claude-yolt...\n'));

// Create config directory
const configDir = path.join(process.env.HOME, '.claude-yolt');
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
  console.log(chalk.green('✓ Created config directory'));
}

// Install Claude CLI if not present
try {
  execSync('which claude', { stdio: 'ignore' });
  console.log(chalk.green('✓ Claude CLI already installed'));
} catch {
  console.log(chalk.yellow('Installing @anthropic-ai/claude-code...'));
  try {
    execSync('npm install -g @anthropic-ai/claude-code', { stdio: 'inherit' });
    console.log(chalk.green('✓ Installed Claude CLI'));
  } catch (err) {
    console.error(chalk.red('Failed to install Claude CLI'));
    console.error(chalk.gray('Please install manually: npm install -g @anthropic-ai/claude-code'));
  }
}

// Try to build Rust binaries
console.log(chalk.yellow('\nBuilding Rust binaries for better performance...'));
try {
  execSync('cargo --version', { stdio: 'ignore' });
  execSync('cargo build --release --manifest-path rust/Cargo.toml', {
    cwd: __dirname,
    stdio: 'inherit'
  });
  console.log(chalk.green('✓ Built Rust binaries'));
  console.log(chalk.gray('  Install globally: cargo install --path rust/'));
} catch {
  console.log(chalk.yellow('⚠️  Rust not available, using JavaScript fallback'));
  console.log(chalk.gray('  Install Rust for better performance: https://rustup.rs'));
}

// Make bin files executable
const binDir = path.join(__dirname, 'bin');
const binFiles = fs.readdirSync(binDir);
binFiles.forEach(file => {
  const filePath = path.join(binDir, file);
  fs.chmodSync(filePath, '755');
});
console.log(chalk.green('✓ Made bin files executable'));

console.log(chalk.green('\n✨ Setup complete!\n'));
console.log(chalk.cyan('Available commands:'));
console.log('  claude-yolo    - Pure YOLT (no limits)');
console.log('  claude-yolt    - YOLO with safety (recommended)');
console.log('  claude-airbag  - Maximum safety');
console.log('  claude-seatbelt - Wrap any command with safety');
console.log('  claude-router  - Smart routing to save money');
console.log(chalk.gray('\nRun any command with --help for more info'));