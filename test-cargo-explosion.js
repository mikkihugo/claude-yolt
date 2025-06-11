#!/usr/bin/env node

import { spawn, exec } from 'child_process';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';

console.log(chalk.cyan('🧪 Testing Rust/Cargo process explosion fix...'));

// Create a test Rust project
const testDir = '/tmp/claude-yolt-test-rust';
const startTime = Date.now();

console.log(chalk.yellow('Creating test Rust project...'));

// Clean up any existing test
exec(`rm -rf ${testDir}`, (err) => {
  // Create new test project
  exec(`mkdir -p ${testDir}`, (err) => {
    if (err) {
      console.error(chalk.red('Failed to create test directory'));
      process.exit(1);
    }
    
    // Create a Cargo.toml with many dependencies to trigger parallel builds
    const cargoToml = `[package]
name = "test-explosion"
version = "0.1.0"
edition = "2021"

[dependencies]
serde = { version = "1.0", features = ["derive"] }
tokio = { version = "1", features = ["full"] }
regex = "1"
chrono = "0.4"
clap = "4"
anyhow = "1"
`;
    
    fs.writeFileSync(path.join(testDir, 'Cargo.toml'), cargoToml);
    
    // Create main.rs
    const mainRs = `fn main() {
    println!("Testing process limits!");
}`;
    
    fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(testDir, 'src', 'main.rs'), mainRs);
    
    console.log(chalk.yellow('\nRunning cargo build through claude-yolt...\n'));
    
    // Monitor system processes during build
    let maxProcesses = 0;
    const monitor = setInterval(() => {
      exec('ps aux | grep -E "(cargo|rustc)" | wc -l', (err, stdout) => {
        if (!err) {
          const count = parseInt(stdout.trim());
          if (count > maxProcesses) {
            maxProcesses = count;
            console.log(chalk.blue(`ℹ Rust processes: ${count}`));
          }
        }
      });
    }, 500);
    
    // Run cargo build through our wrapper
    const child = spawn('claude-yolt', [
      'run cargo build in ' + testDir
    ], {
      cwd: testDir,
      env: {
        ...process.env,
        CLAUDE_MAX_PROCESSES: '20',  // Low limit to test queueing
        CLAUDE_PROCESS_DELAY: '50'
      }
    });
    
    child.stdout.on('data', (data) => {
      process.stdout.write(data);
    });
    
    child.stderr.on('data', (data) => {
      process.stderr.write(data);
    });
    
    child.on('exit', (code) => {
      clearInterval(monitor);
      const duration = Math.round((Date.now() - startTime) / 1000);
      
      console.log(chalk.cyan(`\n📊 Test Results:`));
      console.log(chalk.green(`✓ Build completed with exit code: ${code}`));
      console.log(chalk.green(`✓ Maximum concurrent Rust processes: ${maxProcesses}`));
      console.log(chalk.green(`✓ Total duration: ${duration}s`));
      
      if (maxProcesses <= 25) {
        console.log(chalk.green('\n✅ Process limiter successfully prevented explosion!'));
      } else {
        console.log(chalk.red('\n❌ Too many processes spawned!'));
      }
      
      // Cleanup
      exec(`rm -rf ${testDir}`);
      process.exit(code);
    });
  });
});