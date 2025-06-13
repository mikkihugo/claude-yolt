#!/usr/bin/env node

import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { memoryLeakDetector } from './lib/memory-leak-detector.js';
import { bugWorkarounds } from './lib/bug-workarounds.js';

console.log(chalk.cyan('🐛 Memory Leak Bug Hunt - Generating Report\n'));

async function generateBugHuntReport() {
  try {
    // Update baseline first
    memoryLeakDetector.updateBaseline();
    
    // Run comprehensive scan
    console.log(chalk.yellow('🔍 Running comprehensive memory leak scan...'));
    const findings = await memoryLeakDetector.scan();
    
    // Also run general bug detection
    console.log(chalk.yellow('🔧 Running general bug detection...'));
    const bugResults = await bugWorkarounds.autoFix();
    
    // Generate reports in both formats
    const jsonReport = memoryLeakDetector.generateReport('json');
    const markdownReport = memoryLeakDetector.generateReport('markdown');
    
    // Save reports
    const reportsDir = path.join(process.cwd(), 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = path.join(reportsDir, `memory-leak-report-${timestamp}.json`);
    const mdPath = path.join(reportsDir, `memory-leak-report-${timestamp}.md`);
    
    fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));
    fs.writeFileSync(mdPath, markdownReport);
    
    console.log(chalk.green('\n✅ Bug Hunt Report Generated:'));
    console.log(chalk.blue(`📄 JSON Report: ${jsonPath}`));
    console.log(chalk.blue(`📄 Markdown Report: ${mdPath}`));
    
    // Display summary
    console.log(chalk.cyan('\n📊 Summary:'));
    console.log(`  Memory Leaks Found: ${findings.length}`);
    console.log(`  General Bugs Fixed: ${bugResults.bugsFixed}`);
    console.log(`  Total Issues: ${findings.length + bugResults.bugsFixed}`);
    
    if (findings.length > 0) {
      console.log(chalk.yellow('\n🚨 Memory Leak Findings:'));
      findings.forEach(finding => {
        console.log(chalk.red(`  • ${finding.name} (${finding.severity})`));
        console.log(chalk.gray(`    ${finding.description}`));
      });
    }
    
    // Print markdown report to console for immediate viewing
    console.log(chalk.cyan('\n📋 Bug Hunt Report (Markdown Format):'));
    console.log(chalk.gray('=' .repeat(60)));
    console.log(markdownReport);
    console.log(chalk.gray('=' .repeat(60)));
    
    return {
      success: true,
      memoryLeaks: findings.length,
      bugsFixed: bugResults.bugsFixed,
      reports: { json: jsonPath, markdown: mdPath }
    };
    
  } catch (error) {
    console.error(chalk.red('❌ Error generating bug hunt report:'), error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Run the bug hunt
generateBugHuntReport().then(result => {
  if (result.success) {
    console.log(chalk.green('\n🎉 Bug hunt completed successfully!'));
  } else {
    console.log(chalk.red('\n💥 Bug hunt failed!'));
    process.exit(1);
  }
});