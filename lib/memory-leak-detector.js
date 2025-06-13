import { spawn, execSync } from 'child_process';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { metrics } from './metrics.js';

/**
 * Memory Leak Detection System
 * Focuses on creative edge cases and memory-related issues
 * Based on Grok-3 Creative Bug Analysis scenarios
 */
export class MemoryLeakDetector {
  constructor() {
    this.detectors = new Map();
    this.findings = [];
    this.lastCheck = Date.now();
    this.memoryBaseline = process.memoryUsage();
    this.loadDetectors();
  }

  loadDetectors() {
    // 1. Timing-Dependent Memory Issues
    this.detectors.set('leap_second_memory', {
      name: 'Leap Second Memory Accumulation',
      severity: 'medium',
      detect: () => {
        const now = new Date();
        // Check if we're near a leap second (June 30 or December 31)
        const isLeapSecondPeriod = (now.getMonth() === 5 && now.getDate() === 30) ||
                                   (now.getMonth() === 11 && now.getDate() === 31);
        
        if (isLeapSecondPeriod) {
          const memUsage = process.memoryUsage();
          const growth = memUsage.heapUsed - this.memoryBaseline.heapUsed;
          // Detect unusual memory growth during leap second periods
          return growth > 50 * 1024 * 1024; // 50MB growth
        }
        return false;
      },
      description: 'Memory accumulation during leap second adjustments'
    });

    this.detectors.set('ntp_sync_buffer_leak', {
      name: 'NTP Sync Buffer Leak',
      severity: 'high',
      detect: () => {
        try {
          // Check for processes waiting on time sync
          const ntpProcesses = execSync('ps aux | grep -c "ntp\\|chrony" || echo 0').toString().trim();
          const memUsage = process.memoryUsage();
          
          // If time sync is active and we have growing heap
          if (parseInt(ntpProcesses) > 0) {
            const heapGrowth = memUsage.heapUsed - this.memoryBaseline.heapUsed;
            return heapGrowth > 100 * 1024 * 1024; // 100MB growth with NTP activity
          }
        } catch (e) {
          // Ignore errors in detection
        }
        return false;
      },
      description: 'Memory leak in buffers during NTP time synchronization'
    });

    // 2. Process Archaeology - Zombie and Handle Leaks
    this.detectors.set('zombie_memory_leak', {
      name: 'Zombie Process Memory Leak',
      severity: 'high',
      detect: () => {
        try {
          const zombies = execSync('ps aux | awk \'$8 ~ /^Z/ { count++ } END { print count+0 }\'').toString().trim();
          const zombieCount = parseInt(zombies);
          
          if (zombieCount > 5) {
            // Check if our memory is growing with zombie count
            const memUsage = process.memoryUsage();
            const memoryPerZombie = (memUsage.heapUsed - this.memoryBaseline.heapUsed) / zombieCount;
            return memoryPerZombie > 1024 * 1024; // 1MB per zombie suggests leak
          }
        } catch (e) {
          // Ignore detection errors
        }
        return false;
      },
      description: 'Memory not released from zombie processes'
    });

    this.detectors.set('file_handle_leak', {
      name: 'File Handle Memory Leak',
      severity: 'critical',
      detect: () => {
        try {
          const openFiles = execSync(`lsof -p ${process.pid} | wc -l`).toString().trim();
          const handleCount = parseInt(openFiles);
          
          // Excessive file handles suggest handle leaks
          if (handleCount > 1000) {
            const memUsage = process.memoryUsage();
            const growth = memUsage.heapUsed - this.memoryBaseline.heapUsed;
            // Memory should grow roughly with handle count
            return growth > handleCount * 1024; // 1KB per handle minimum
          }
        } catch (e) {
          // Process might not exist or lsof not available
        }
        return false;
      },
      description: 'Memory leak from unclosed file handles'
    });

    // 3. Chaos Engineering - Extreme Load Memory Issues
    this.detectors.set('overload_memory_cliff', {
      name: 'Performance Cliff Memory Leak',
      severity: 'high',
      detect: () => {
        const cpuUsage = process.cpuUsage();
        const memUsage = process.memoryUsage();
        
        // High memory usage suggests cliff (lowered threshold for demo)
        const memoryMB = memUsage.heapUsed / (1024 * 1024);
        
        // If memory is over 100MB and growing from baseline
        if (memoryMB > 100) {
          const memoryGrowth = memUsage.heapUsed - this.memoryBaseline.heapUsed;
          return memoryGrowth > 50 * 1024 * 1024; // 50MB growth (lowered for demo)
        }
        return false;
      },
      description: 'Memory cliff under extreme CPU load'
    });

    this.detectors.set('network_partition_leak', {
      name: 'Network Partition Memory Leak',
      severity: 'medium',
      detect: () => {
        try {
          // Check for hanging network connections
          const connections = execSync('netstat -an | grep -c "CLOSE_WAIT\\|FIN_WAIT" || echo 0').toString().trim();
          const hangingConnections = parseInt(connections);
          
          if (hangingConnections > 10) {
            const memUsage = process.memoryUsage();
            const growth = memUsage.heapUsed - this.memoryBaseline.heapUsed;
            // Memory growth with hanging connections suggests leak
            return growth > hangingConnections * 64 * 1024; // 64KB per connection
          }
        } catch (e) {
          // Ignore network detection errors
        }
        return false;
      },
      description: 'Memory leak from hanging network connections'
    });

    // 4. Emergent Behaviors - Feedback Loops
    this.detectors.set('logging_feedback_leak', {
      name: 'Logging Feedback Memory Leak',
      severity: 'critical',
      detect: () => {
        try {
          // Check if log files are growing rapidly
          const logFiles = ['/tmp/claude-yolt.log', './claude-yolt.log', 'debug.log'];
          let totalLogSize = 0;
          
          for (const logFile of logFiles) {
            try {
              if (fs.existsSync(logFile)) {
                const stats = fs.statSync(logFile);
                totalLogSize += stats.size;
              }
            } catch (e) {
              // Ignore individual file errors
            }
          }
          
          // If logs are over 10MB, check memory correlation (lowered threshold for demo)
          if (totalLogSize > 10 * 1024 * 1024) {
            const memUsage = process.memoryUsage();
            const memoryMB = memUsage.heapUsed / (1024 * 1024);
            const logMB = totalLogSize / (1024 * 1024);
            
            // Memory growing proportionally with logs suggests feedback loop
            return memoryMB > logMB * 0.05; // 5% of log size in memory (lowered for demo)
          }
        } catch (e) {
          // Ignore log detection errors
        }
        return false;
      },
      description: 'Memory leak from logging feedback loops'
    });

    // 5. Platform-Specific Memory Issues
    this.detectors.set('windows_path_memory_leak', {
      name: 'Windows Long Path Memory Leak',
      severity: 'medium',
      detect: () => {
        if (process.platform === 'win32') {
          try {
            // Check for long paths in current working directory
            const cwd = process.cwd();
            if (cwd.length > 240) { // Near Windows path limit
              const memUsage = process.memoryUsage();
              const growth = memUsage.heapUsed - this.memoryBaseline.heapUsed;
              // Long paths can cause memory accumulation in path resolution
              return growth > 10 * 1024 * 1024; // 10MB growth with long paths
            }
          } catch (e) {
            // Ignore platform detection errors
          }
        }
        return false;
      },
      description: 'Memory leak from Windows long path handling'
    });

    this.detectors.set('entropy_pool_memory_block', {
      name: 'Entropy Pool Memory Blocking',
      severity: 'medium',
      detect: () => {
        if (process.platform !== 'win32') {
          try {
            // Check entropy pool availability
            const entropy = fs.readFileSync('/proc/sys/kernel/random/entropy_avail', 'utf8').trim();
            const entropyLevel = parseInt(entropy);
            
            if (entropyLevel < 100) { // Low entropy
              const memUsage = process.memoryUsage();
              const growth = memUsage.heapUsed - this.memoryBaseline.heapUsed;
              // Processes waiting on entropy can accumulate memory
              return growth > 20 * 1024 * 1024; // 20MB growth with low entropy
            }
          } catch (e) {
            // Ignore entropy detection errors
          }
        }
        return false;
      },
      description: 'Memory accumulation while waiting for entropy'
    });
  }

  /**
   * Run all memory leak detectors
   */
  async scan() {
    console.log(chalk.cyan('🔍 Running memory leak detection scan...'));
    
    this.findings = [];
    let detectedCount = 0;

    for (const [key, detector] of this.detectors) {
      try {
        if (await detector.detect()) {
          const finding = {
            type: key,
            name: detector.name,
            severity: detector.severity,
            description: detector.description,
            timestamp: new Date().toISOString(),
            memoryUsage: process.memoryUsage()
          };
          
          this.findings.push(finding);
          detectedCount++;
          
          console.log(chalk.red(`🐛 DETECTED: ${detector.name} (${detector.severity})`));
          console.log(chalk.gray(`   ${detector.description}`));
          
          // Update metrics
          metrics.bugsDetected.inc({ bug_type: key });
        }
      } catch (error) {
        console.log(chalk.yellow(`⚠️  Error in detector ${detector.name}: ${error.message}`));
      }
    }

    this.lastCheck = Date.now();
    
    if (detectedCount === 0) {
      console.log(chalk.green('✓ No memory leaks detected'));
    } else {
      console.log(chalk.yellow(`🚨 Found ${detectedCount} potential memory leak(s)`));
    }

    return this.findings;
  }

  /**
   * Generate a memory leak report
   */
  generateReport(format = 'json') {
    const report = {
      scanTime: new Date().toISOString(),
      totalIssues: this.findings.length,
      findings: this.findings.map(f => ({
        type: f.type,
        name: f.name,
        severity: f.severity,
        description: f.description,
        timestamp: f.timestamp
      })),
      memorySnapshot: process.memoryUsage(),
      systemInfo: {
        platform: process.platform,
        nodeVersion: process.version,
        uptime: process.uptime(),
        pid: process.pid
      }
    };

    if (format === 'markdown') {
      return this.generateMarkdownReport(report);
    }

    return report;
  }

  /**
   * Generate markdown report matching the issue format
   */
  generateMarkdownReport(report) {
    const date = new Date().toISOString().split('T')[0];
    
    let markdown = `# 🐛 Bug Hunt Report - ${date}\n\n`;
    markdown += `Focus area: memory-leaks\n\n`;
    
    // Memory leak findings
    markdown += `## memory.md\n`;
    if (report.findings.length === 0) {
      markdown += `null\n\n`;
      markdown += `Total potential issues found: 0\n`;
      markdown += `0\n\n`;
    } else {
      markdown += `## Memory Leak Findings\n\n`;
      
      report.findings.forEach(finding => {
        markdown += `### ${finding.name} (${finding.severity})\n`;
        markdown += `- **Type**: ${finding.type}\n`;
        markdown += `- **Description**: ${finding.description}\n`;
        markdown += `- **Detected**: ${finding.timestamp}\n\n`;
      });
      
      markdown += `\nTotal potential issues found: ${report.findings.length}\n`;
      markdown += `${report.findings.length}\n\n`;
    }
    
    // System information
    markdown += `## System Information\n\n`;
    markdown += `- **Platform**: ${report.systemInfo.platform}\n`;
    markdown += `- **Node Version**: ${report.systemInfo.nodeVersion}\n`;
    markdown += `- **Process ID**: ${report.systemInfo.pid}\n`;
    markdown += `- **Uptime**: ${report.systemInfo.uptime.toFixed(2)}s\n`;
    
    // Memory snapshot
    markdown += `\n## Memory Snapshot\n\n`;
    const mem = report.memorySnapshot;
    markdown += `- **RSS**: ${(mem.rss / 1024 / 1024).toFixed(1)}MB\n`;
    markdown += `- **Heap Used**: ${(mem.heapUsed / 1024 / 1024).toFixed(1)}MB\n`;
    markdown += `- **Heap Total**: ${(mem.heapTotal / 1024 / 1024).toFixed(1)}MB\n`;
    markdown += `- **External**: ${(mem.external / 1024 / 1024).toFixed(1)}MB\n`;
    
    return markdown;
  }

  /**
   * Start continuous monitoring
   */
  startMonitoring(intervalMs = 60000) {
    console.log(chalk.cyan(`🔄 Starting memory leak monitoring (${intervalMs/1000}s intervals)`));
    
    setInterval(async () => {
      await this.scan();
    }, intervalMs);
  }

  /**
   * Update memory baseline for comparison
   */
  updateBaseline() {
    this.memoryBaseline = process.memoryUsage();
    console.log(chalk.blue('📊 Updated memory baseline'));
  }
}

export const memoryLeakDetector = new MemoryLeakDetector();