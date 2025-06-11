import readline from 'readline';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';

// ANSI color codes
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

export async function checkFirstRunConsent(consentPath) {
  // If consent already given, return true
  if (fs.existsSync(consentPath)) {
    return true;
  }

  // Create directory if needed
  const dir = path.dirname(consentPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  console.log(`\n${BOLD}${YELLOW}⚠️  CLAUDE-YOLT SAFETY WARNING ⚠️${RESET}\n`);
  console.log(`${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  
  console.log(`\n${BOLD}What is claude-yolt?${RESET}`);
  console.log(`A modified version of Claude CLI that:`);
  console.log(`  • ${RED}BYPASSES ALL PERMISSION CHECKS${RESET} automatically`);
  console.log(`  • ${YELLOW}Adds safety limits${RESET} (4GB RAM, CPU limits)`);
  console.log(`  • ${GREEN}Auto-updates${RESET} Claude CLI to latest version\n`);

  console.log(`${BOLD}${RED}🚨 DANGER ZONE 🚨${RESET}`);
  console.log(`This tool ${BOLD}DISABLES SECURITY FEATURES${RESET} designed to protect:`);
  console.log(`  ❌ Your personal files and data`);
  console.log(`  ❌ System configuration files`);
  console.log(`  ❌ SSH keys and credentials`);
  console.log(`  ❌ Browser cookies and passwords\n`);

  console.log(`${BOLD}By continuing, you acknowledge:${RESET}`);
  console.log(`  • Claude can ${RED}read/write ANY file${RESET} on your system`);
  console.log(`  • You accept ${RED}FULL RESPONSIBILITY${RESET} for any consequences`);
  console.log(`  • This is ${YELLOW}NOT RECOMMENDED${RESET} for production use\n`);

  console.log(`${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n`);

  // Set up readline with timeout
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  let countdown = 10;
  let answered = false;
  let intervalId;

  const promise = new Promise((resolve) => {
    // Show initial prompt
    process.stdout.write(`${YELLOW}Do you understand the risks? (yes/no) [auto-proceed in ${countdown}s]: ${RESET}`);

    // Start countdown
    intervalId = setInterval(() => {
      countdown--;
      if (countdown > 0 && !answered) {
        // Clear line and rewrite
        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);
        process.stdout.write(`${YELLOW}Do you understand the risks? (yes/no) [auto-proceed in ${countdown}s]: ${RESET}`);
      } else if (countdown === 0 && !answered) {
        clearInterval(intervalId);
        rl.close();
        console.log(`\n\n${YELLOW}⏱️  No response - proceeding with YOLT mode...${RESET}`);
        console.log(`${CYAN}To disable this warning, respond 'yes' next time.${RESET}\n`);
        resolve(true);
      }
    }, 1000);

    // Handle user input
    rl.on('line', (answer) => {
      answered = true;
      clearInterval(intervalId);
      rl.close();
      
      const response = answer.toLowerCase().trim();
      if (response === 'yes' || response === 'y') {
        console.log(`\n${GREEN}✓ Consent recorded. This warning won't appear again.${RESET}\n`);
        // Save consent
        fs.writeFileSync(consentPath, JSON.stringify({
          timestamp: new Date().toISOString(),
          version: '1.0.0'
        }));
        resolve(true);
      } else if (response === 'no' || response === 'n') {
        console.log(`\n${RED}✗ Consent declined. Exiting.${RESET}`);
        console.log(`${CYAN}Use regular 'claude' command for safe mode.${RESET}\n`);
        resolve(false);
      } else {
        console.log(`\n${YELLOW}Invalid response - proceeding anyway...${RESET}\n`);
        resolve(true);
      }
    });
  });

  return promise;
}