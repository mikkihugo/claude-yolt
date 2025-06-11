#!/usr/bin/env node

import { spawn, exec } from 'child_process';
import chalk from 'chalk';

console.log(chalk.cyan('🧪 Testing fd process explosion fix...'));

// Monitor fd processes
let maxFdProcesses = 0;
const monitor = setInterval(() => {
  exec('pgrep -c fd || echo 0', (err, stdout) => {
    if (!err) {
      const count = parseInt(stdout.trim());
      if (count > maxFdProcesses) {
        maxFdProcesses = count;
        if (count > 1) {
          console.log(chalk.blue(`ℹ fd processes: ${count}`));
        }
      }
    }
  });
}, 100);

console.log(chalk.yellow('\nRunning fd command through claude-yolt...\n'));

// Test fd through our wrapper - search in a large directory
const child = spawn('claude-yolt', [
  'find all .js files in /usr using fd'
], {
  env: {
    ...process.env,
    CLAUDE_MAX_PROCESSES: '10',
    CLAUDE_PROCESS_DELAY: '50'
  }
});

let output = '';
child.stdout.on('data', (data) => {
  output += data.toString();
  // Don't flood console
  if (output.split('\n').length < 20) {
    process.stdout.write(data);
  }
});

child.stderr.on('data', (data) => {
  process.stderr.write(data);
});

child.on('exit', (code) => {
  clearInterval(monitor);
  
  console.log(chalk.cyan(`\n📊 Test Results:`));
  console.log(chalk.green(`✓ fd command completed with exit code: ${code}`));
  console.log(chalk.green(`✓ Maximum concurrent fd processes: ${maxFdProcesses}`));
  console.log(chalk.green(`✓ Output lines: ${output.split('\n').length}`));
  
  if (maxFdProcesses <= 2) {
    console.log(chalk.green('\n✅ fd process limiting working correctly!'));
  } else {
    console.log(chalk.red(`\n❌ Too many fd processes spawned: ${maxFdProcesses}`));
  }
  
  process.exit(code);
});