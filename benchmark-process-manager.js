#!/usr/bin/env node

import { spawn } from 'child_process';
import { performance } from 'perf_hooks';
import chalk from 'chalk';

console.log(chalk.cyan('🏎️  Process Manager Performance Benchmark\n'));

// Test scenarios
const tests = [
  {
    name: 'Rapid fd spawning',
    command: 'fd',
    args: ['.js', '--max-results=10'],
    count: 100
  },
  {
    name: 'Memory stress test', 
    command: 'echo',
    args: ['x'.repeat(1000)],
    count: 500
  },
  {
    name: 'Process explosion simulation',
    command: 'sleep',
    args: ['0.1'],
    count: 300
  }
];

async function runTest(test) {
  console.log(chalk.yellow(`\n📊 ${test.name}`));
  console.log(chalk.gray(`   Command: ${test.command} ${test.args.join(' ')}`));
  console.log(chalk.gray(`   Iterations: ${test.count}`));
  
  const start = performance.now();
  const processes = [];
  
  // Spawn all processes
  for (let i = 0; i < test.count; i++) {
    const child = spawn(test.command, test.args, {
      stdio: ['ignore', 'pipe', 'ignore']
    });
    
    // Drain stdout to prevent deadlock
    child.stdout.on('data', () => {});
    
    processes.push(child);
  }
  
  // Wait for all to complete
  await Promise.all(
    processes.map(p => new Promise(resolve => p.on('exit', resolve)))
  );
  
  const elapsed = performance.now() - start;
  const perProcess = elapsed / test.count;
  
  console.log(chalk.green(`   ✓ Completed in ${elapsed.toFixed(2)}ms`));
  console.log(chalk.green(`   ✓ ${perProcess.toFixed(2)}ms per process`));
  console.log(chalk.green(`   ✓ ${(test.count / (elapsed / 1000)).toFixed(0)} processes/second`));
  
  // Check system impact
  const memUsage = process.memoryUsage();
  console.log(chalk.blue(`   Memory: RSS ${(memUsage.rss / 1024 / 1024).toFixed(1)}MB, Heap ${(memUsage.heapUsed / 1024 / 1024).toFixed(1)}MB`));
}

// Monitor system during tests
const startCpu = process.cpuUsage();
const startMem = process.memoryUsage();

console.log(chalk.cyan('Starting benchmark...'));

// Run tests sequentially
for (const test of tests) {
  await runTest(test);
  
  // Brief pause between tests
  await new Promise(resolve => setTimeout(resolve, 1000));
}

// Final stats
const endCpu = process.cpuUsage(startCpu);
const endMem = process.memoryUsage();

console.log(chalk.cyan('\n📈 Overall Performance:'));
console.log(chalk.green(`   CPU time: ${(endCpu.user + endCpu.system) / 1000}ms`));
console.log(chalk.green(`   Memory delta: ${((endMem.rss - startMem.rss) / 1024 / 1024).toFixed(1)}MB`));
console.log(chalk.green(`   Peak heap: ${(endMem.heapUsed / 1024 / 1024).toFixed(1)}MB`));

// Check if interceptor is working
const ps = spawn('ps', ['aux']);
let processCount = 0;
ps.stdout.on('data', (data) => {
  processCount = data.toString().split('\n').length;
});
ps.on('exit', () => {
  console.log(chalk.blue(`\n   Current system processes: ${processCount}`));
  
  if (processCount > 500) {
    console.log(chalk.red('   ⚠️  High process count detected!'));
  } else {
    console.log(chalk.green('   ✓ Process count normal'));
  }
});