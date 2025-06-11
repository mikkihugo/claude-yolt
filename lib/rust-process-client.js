import net from 'net';
import { spawn } from 'child_process';
import chalk from 'chalk';

const SOCKET_PATH = '/tmp/claude-process-guard.sock';
let client = null;
let guardProcess = null;
let connected = false;

// Start the Rust process guard if not running
function ensureGuardRunning() {
  // Check if socket exists
  try {
    const socket = net.createConnection(SOCKET_PATH);
    socket.on('connect', () => {
      socket.end();
      connected = true;
    });
    socket.on('error', () => {
      startGuard();
    });
  } catch (e) {
    startGuard();
  }
}

function startGuard() {
  console.log(chalk.cyan('🚀 Starting Rust process guard...'));
  
  const guardPath = new URL('../rust-process-manager/target/release/claude-process-guard', import.meta.url).pathname;
  
  // Build if not exists
  if (!require('fs').existsSync(guardPath)) {
    console.log(chalk.yellow('Building process guard...'));
    require('child_process').execSync('cargo build --release', {
      cwd: new URL('../rust-process-manager', import.meta.url).pathname,
      stdio: 'inherit'
    });
  }
  
  guardProcess = spawn(guardPath, [], {
    detached: true,
    stdio: 'ignore'
  });
  
  guardProcess.unref();
  
  // Wait for it to start
  setTimeout(() => {
    connectToGuard();
  }, 1000);
}

function connectToGuard() {
  client = net.createConnection(SOCKET_PATH);
  
  client.on('connect', () => {
    connected = true;
    console.log(chalk.green('✓ Connected to process guard'));
  });
  
  client.on('error', (err) => {
    connected = false;
    console.error(chalk.red('Process guard connection error:', err.message));
  });
  
  client.on('close', () => {
    connected = false;
    client = null;
  });
}

// Register a process with the guard
export function registerProcess(pid, command, args = []) {
  if (!connected) {
    ensureGuardRunning();
    // Queue the registration
    setTimeout(() => registerProcess(pid, command, args), 1000);
    return;
  }
  
  const msg = JSON.stringify({
    Register: { pid, command, args }
  }) + '\n';
  
  try {
    client.write(msg);
  } catch (e) {
    console.error(chalk.red('Failed to register process:', e.message));
  }
}

// Unregister a process
export function unregisterProcess(pid) {
  if (!connected || !client) return;
  
  const msg = JSON.stringify({
    Unregister: { pid }
  }) + '\n';
  
  try {
    client.write(msg);
  } catch (e) {
    // Ignore errors on unregister
  }
}

// Initialize on import
ensureGuardRunning();