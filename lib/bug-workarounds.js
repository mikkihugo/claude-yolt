import { spawn, execSync } from 'child_process';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { memoryLeakDetector } from './memory-leak-detector.js';

// Workarounds for known Anthropic bugs they won't fix
export class BugWorkarounds {
  constructor() {
    this.knownBugs = new Map();
    this.loadWorkarounds();
  }

  loadWorkarounds() {
    // Bug #952: JavaScript heap out of memory
    this.knownBugs.set('heap_oom', {
      detect: (error) => error.includes('JavaScript heap out of memory'),
      fix: () => {
        console.log(chalk.yellow('🔧 Applying heap size fix...'));
        process.env.NODE_OPTIONS = '--max-old-space-size=8192';
        return true;
      }
    });

    // Bug #1156: Bash processes left around after exit
    this.knownBugs.set('orphan_bash', {
      detect: () => {
        try {
          const orphans = execSync('pgrep -f "bash.*claude" | wc -l').toString().trim();
          return parseInt(orphans) > 5;
        } catch (e) {
          return false;
        }
      },
      fix: () => {
        console.log(chalk.yellow('🔧 Cleaning orphaned bash processes...'));
        try {
          execSync('pkill -f "bash.*claude" || true');
          return true;
        } catch (e) {
          return false;
        }
      }
    });

    // Bug #1935: MCP servers not properly terminated
    this.knownBugs.set('mcp_orphans', {
      detect: () => {
        try {
          const mcpCount = execSync('pgrep -f "mcp.*server" | wc -l').toString().trim();
          return parseInt(mcpCount) > 0;
        } catch (e) {
          return false;
        }
      },
      fix: () => {
        console.log(chalk.yellow('🔧 Terminating orphaned MCP servers...'));
        try {
          execSync('pkill -f "mcp.*server" || true');
          return true;
        } catch (e) {
          return false;
        }
      }
    });

    // Bug #1734: Commands not accessible
    this.knownBugs.set('missing_commands', {
      detect: () => !fs.existsSync(path.join(process.env.HOME, '.claude', 'commands')),
      fix: () => {
        console.log(chalk.yellow('🔧 Creating missing commands directory...'));
        const cmdDir = path.join(process.env.HOME, '.claude', 'commands');
        fs.mkdirSync(cmdDir, { recursive: true });
        
        // Add basic commands
        const basicCommands = {
          'clear': '#!/bin/bash\nclear',
          'reset': '#!/bin/bash\nreset',
          'help': '#!/bin/bash\necho "Claude YOLT - Working around Anthropic bugs since they won\'t"'
        };
        
        for (const [name, content] of Object.entries(basicCommands)) {
          const cmdPath = path.join(cmdDir, name);
          fs.writeFileSync(cmdPath, content);
          fs.chmodSync(cmdPath, 0o755);
        }
        return true;
      }
    });

    // Common 529 Overloaded errors
    this.knownBugs.set('api_overload', {
      detect: (error) => error.includes('529') || error.includes('overloaded'),
      fix: async () => {
        console.log(chalk.yellow('🔧 API overloaded, adding retry logic...'));
        // Force exponential backoff
        process.env.CLAUDE_RETRY_DELAY = '5000';
        process.env.CLAUDE_MAX_RETRIES = '10';
        
        // Also slow down request rate
        process.env.CLAUDE_PROCESS_DELAY = '500';
        
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 5000));
        return true;
      }
    });

    // Memory exhaustion from rapid allocations
    this.knownBugs.set('memory_exhaustion', {
      detect: () => {
        const memUsage = process.memoryUsage();
        const heapUsedMB = memUsage.heapUsed / (1024 * 1024);
        const rssUsedMB = memUsage.rss / (1024 * 1024);
        
        // Detect when heap or RSS usage is dangerously high
        return heapUsedMB > 1024 || rssUsedMB > 2048; // 1GB heap or 2GB RSS
      },
      fix: async () => {
        console.log(chalk.yellow('🔧 High memory usage detected, triggering GC...'));
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
          console.log(chalk.green('✓ Forced garbage collection'));
        }
        
        // Update memory baseline for leak detection
        memoryLeakDetector.updateBaseline();
        
        // Set lower memory limits for new processes
        process.env.NODE_OPTIONS = (process.env.NODE_OPTIONS || '') + ' --max-old-space-size=1024';
        
        return true;
      }
    });
  }

  // Auto-detect and fix issues
  async autoFix() {
    console.log(chalk.cyan('🔍 Checking for known Anthropic bugs...'));
    
    // Run memory leak detection first
    const memoryFindings = await memoryLeakDetector.scan();
    
    let fixedCount = 0;
    for (const [bugName, bug] of this.knownBugs) {
      try {
        if (await bug.detect()) {
          console.log(chalk.yellow(`⚠️  Detected: ${bugName}`));
          if (await bug.fix()) {
            fixedCount++;
          }
        }
      } catch (e) {
        // Ignore detection errors
      }
    }
    
    if (fixedCount > 0) {
      console.log(chalk.green(`✓ Applied ${fixedCount} workarounds`));
    } else if (memoryFindings.length === 0) {
      console.log(chalk.gray('✓ No issues detected'));
    }
    
    // Return combined results
    return {
      bugsFixed: fixedCount,
      memoryLeaks: memoryFindings.length,
      findings: memoryFindings
    };
  }

  // Monitor for issues during runtime
  startMonitoring() {
    // Start memory leak monitoring
    memoryLeakDetector.startMonitoring(30000); // Check every 30 seconds
    
    // Check every 30 seconds for orphaned processes
    setInterval(() => {
      const orphanBugs = ['orphan_bash', 'mcp_orphans'];
      for (const bugName of orphanBugs) {
        const bug = this.knownBugs.get(bugName);
        if (bug && bug.detect()) {
          bug.fix();
        }
      }
    }, 30000);

    // Hook into process errors
    process.on('uncaughtException', (error) => {
      const errorStr = error.toString();
      for (const [bugName, bug] of this.knownBugs) {
        if (bug.detect && bug.detect(errorStr)) {
          console.log(chalk.red(`\n💥 Known bug detected: ${bugName}`));
          bug.fix();
          
          // Restart Claude if needed
          if (bugName === 'heap_oom') {
            console.log(chalk.yellow('Restarting with increased heap...'));
            const args = process.argv.slice(2);
            spawn(process.argv[0], [process.argv[1], ...args], {
              stdio: 'inherit',
              env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' }
            });
            process.exit(0);
          }
        }
      }
    });
  }
}

export const bugWorkarounds = new BugWorkarounds();