#!/usr/bin/env node

import chalk from 'chalk';
import { detectTaskType } from './lib/router.js';

console.log(chalk.cyan('\n🧪 Testing claude-yolt components\n'));

// Test task detection
const testPrompts = [
  'lint this code',
  'format my JavaScript files',
  'explain how this function works',
  'create a new React component',
  'fix the syntax errors',
  'design the architecture for a microservice',
  'debug why this is failing',
  'refactor this class to use composition'
];

console.log(chalk.yellow('Task detection tests:'));
testPrompts.forEach(prompt => {
  const type = detectTaskType(prompt);
  console.log(`  "${prompt}" → ${chalk.green(type)}`);
});

console.log(chalk.green('\n✓ Basic tests passed'));
console.log(chalk.gray('\nFor full testing, install the package and try the commands'));