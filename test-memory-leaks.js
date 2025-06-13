#!/usr/bin/env node

import chalk from 'chalk';
import { memoryLeakDetector } from './lib/memory-leak-detector.js';
import { bugWorkarounds } from './lib/bug-workarounds.js';

console.log(chalk.cyan('🧪 Memory Leak Detection Test Suite\n'));

async function simulateMemoryLeak() {
  console.log(chalk.yellow('🔧 Simulating memory conditions...'));
  
  // Simulate memory growth
  const memoryHog = [];
  for (let i = 0; i < 1000; i++) {
    memoryHog.push(new Array(1000).fill('x'.repeat(1000)));
  }
  
  console.log(chalk.blue('📊 Current memory usage:'));
  const usage = process.memoryUsage();
  console.log(`  RSS: ${(usage.rss / 1024 / 1024).toFixed(1)}MB`);
  console.log(`  Heap Used: ${(usage.heapUsed / 1024 / 1024).toFixed(1)}MB`);
  console.log(`  Heap Total: ${(usage.heapTotal / 1024 / 1024).toFixed(1)}MB`);
  console.log(`  External: ${(usage.external / 1024 / 1024).toFixed(1)}MB`);
  
  return memoryHog; // Keep reference to prevent GC
}

async function runTests() {
  try {
    // Test 1: Basic memory leak detection
    console.log(chalk.cyan('\n📋 Test 1: Basic Memory Leak Detection'));
    await memoryLeakDetector.scan();
    
    // Test 2: Simulate memory growth and re-scan
    console.log(chalk.cyan('\n📋 Test 2: Memory Growth Detection'));
    const memoryHog = await simulateMemoryLeak();
    await memoryLeakDetector.scan();
    
    // Test 3: Bug workarounds integration
    console.log(chalk.cyan('\n📋 Test 3: Integrated Bug Detection'));
    const results = await bugWorkarounds.autoFix();
    console.log(chalk.blue(`Results: ${results.bugsFixed} bugs fixed, ${results.memoryLeaks} memory leaks detected`));
    
    // Test 4: Generate report
    console.log(chalk.cyan('\n📋 Test 4: Memory Leak Report Generation'));
    const report = memoryLeakDetector.generateReport();
    console.log(chalk.green('✓ Generated memory leak report:'));
    console.log(JSON.stringify(report, null, 2));
    
    // Clean up
    memoryHog.length = 0;
    
    console.log(chalk.green('\n✅ All memory leak detection tests completed'));
    
  } catch (error) {
    console.error(chalk.red('❌ Test failed:'), error);
    process.exit(1);
  }
}

// Test memory monitoring
console.log(chalk.blue('Starting memory leak detection tests...'));
runTests();