#!/usr/bin/env node

import chalk from 'chalk';
import fs from 'fs';
import { spawn } from 'child_process';
import { memoryLeakDetector } from './lib/memory-leak-detector.js';

console.log(chalk.cyan('🧪 Memory Leak Detection Demo - Triggering Issues\n'));

async function triggerMemoryLeaks() {
  console.log(chalk.yellow('🔧 Creating conditions to trigger memory leak detectors...'));
  
  // Update baseline BEFORE creating issues to detect growth
  console.log(chalk.blue('📊 Setting memory baseline...'));
  memoryLeakDetector.updateBaseline();
  
  // Wait a moment
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // 1. Create large log files to trigger logging feedback leak
  console.log(chalk.blue('📝 Creating large log files...'));
  const logContent = 'x'.repeat(1000) + '\n';
  const logSize = 50 * 1024 * 1024; // 50MB
  
  try {
    const logFile = './claude-yolt.log';
    const stream = fs.createWriteStream(logFile);
    
    for (let i = 0; i < logSize / 1000; i++) {
      stream.write(logContent);
    }
    stream.end();
    
    console.log(chalk.green(`✓ Created large log file: ${logFile}`));
  } catch (e) {
    console.log(chalk.yellow(`⚠️  Could not create log file: ${e.message}`));
  }
  
  // 2. Consume significant memory to trigger memory exhaustion
  console.log(chalk.blue('💾 Consuming memory...'));
  const memoryConsumer = [];
  try {
    // Consume ~200MB of memory
    for (let i = 0; i < 200; i++) {
      memoryConsumer.push(new Array(1024 * 1024).fill('x')); // 1MB arrays
    }
    
    const usage = process.memoryUsage();
    console.log(chalk.green(`✓ Memory consumed: ${(usage.heapUsed / 1024 / 1024).toFixed(1)}MB`));
  } catch (e) {
    console.log(chalk.yellow(`⚠️  Memory consumption limited: ${e.message}`));
  }
  
  // 3. Create file handles to simulate handle leaks (carefully)
  console.log(chalk.blue('📁 Creating file handles...'));
  const handles = [];
  try {
    // Open multiple file handles
    for (let i = 0; i < 50; i++) {
      const fd = fs.openSync('./test-memory-leaks.js', 'r');
      handles.push(fd);
    }
    console.log(chalk.green(`✓ Created ${handles.length} file handles`));
  } catch (e) {
    console.log(chalk.yellow(`⚠️  File handle creation limited: ${e.message}`));
  }
  
  // 4. Spawn some processes to simulate process leaks
  console.log(chalk.blue('🔄 Spawning processes...'));
  const processes = [];
  try {
    for (let i = 0; i < 5; i++) {
      const proc = spawn('sleep', ['0.1'], { detached: true });
      processes.push(proc);
    }
    console.log(chalk.green(`✓ Spawned ${processes.length} processes`));
  } catch (e) {
    console.log(chalk.yellow(`⚠️  Process spawning limited: ${e.message}`));
  }
  
  // Wait a moment for conditions to settle
  await new Promise(resolve => setTimeout(resolve, 200));
  
  // Run detection
  console.log(chalk.cyan('\n🔍 Running memory leak detection after triggering conditions...'));
  const findings = await memoryLeakDetector.scan();
  
  // Generate report
  const report = memoryLeakDetector.generateReport('markdown');
  console.log(chalk.cyan('\n📋 Generated Report:'));
  console.log(chalk.gray('=' .repeat(60)));
  console.log(report);
  console.log(chalk.gray('=' .repeat(60)));
  
  // Cleanup
  console.log(chalk.yellow('\n🧹 Cleaning up...'));
  
  // Close file handles
  handles.forEach(fd => {
    try {
      fs.closeSync(fd);
    } catch (e) {
      // Ignore cleanup errors
    }
  });
  
  // Clean up processes
  processes.forEach(proc => {
    try {
      proc.kill();
    } catch (e) {
      // Ignore cleanup errors
    }
  });
  
  // Remove log file
  try {
    fs.unlinkSync('./claude-yolt.log');
  } catch (e) {
    // Ignore cleanup errors
  }
  
  console.log(chalk.green('✅ Demo completed and cleaned up'));
  
  return findings;
}

// Run the demo
triggerMemoryLeaks().catch(error => {
  console.error(chalk.red('❌ Demo failed:'), error);
  process.exit(1);
});