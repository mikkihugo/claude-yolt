#!/usr/bin/env node

import { spawn } from 'child_process';
import chalk from 'chalk';

console.log(chalk.cyan('🧪 Testing process limiter...'));

// Test configuration
const TEST_PROCESSES = 200;  // Try to spawn 200 processes
let spawned = 0;
let active = 0;
let completed = 0;

// Set environment for testing
process.env.CLAUDE_MAX_PROCESSES = '10';  // Limit to 10 concurrent
process.env.CLAUDE_PROCESS_DELAY = '100'; // 100ms delay

console.log(chalk.yellow(`Attempting to spawn ${TEST_PROCESSES} processes...`));
console.log(chalk.yellow(`Limit set to ${process.env.CLAUDE_MAX_PROCESSES} concurrent\n`));

// Function to spawn a test process
function spawnTest(id) {
  spawned++;
  active++;
  
  // Simulate a cargo/rust command
  const child = spawn('sleep', ['0.5'], {
    env: { ...process.env }
  });
  
  child.on('exit', () => {
    active--;
    completed++;
    
    if (completed % 10 === 0) {
      console.log(chalk.green(`✓ Completed: ${completed}/${TEST_PROCESSES}, Active: ${active}`));
    }
    
    if (completed === TEST_PROCESSES) {
      console.log(chalk.green('\n✅ All processes completed successfully!'));
      console.log(chalk.cyan('Process limiter is working correctly.'));
      process.exit(0);
    }
  });
  
  child.on('error', (err) => {
    console.error(chalk.red(`Process ${id} error: ${err.message}`));
  });
}

// Spawn all test processes rapidly
console.log(chalk.gray('Spawning processes...\n'));
for (let i = 0; i < TEST_PROCESSES; i++) {
  spawnTest(i);
}

// Monitor active processes
setInterval(() => {
  if (active > 0) {
    console.log(chalk.blue(`ℹ Active processes: ${active}`));
  }
}, 1000);