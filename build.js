#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';

console.log(chalk.cyan('🔨 Building claude-yolt...\n'));

// Ensure directories exist
const dirs = ['dist', 'dist/lib', 'dist/bin'];
dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Make all bin scripts executable
const binFiles = fs.readdirSync('bin');
binFiles.forEach(file => {
  const filePath = path.join('bin', file);
  fs.chmodSync(filePath, 0o755);
  console.log(chalk.green(`✓ Made ${file} executable`));
});

// Build Rust components if Rust is available
try {
  console.log(chalk.yellow('\n🦀 Building Rust components...'));
  execSync('cd rust-process-manager && cargo build --release', { stdio: 'inherit' });
  console.log(chalk.green('✓ Rust components built'));
} catch (e) {
  console.log(chalk.gray('⚠️  Rust not available, skipping Rust components'));
}

// Create production package.json
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const prodPkg = {
  ...pkg,
  devDependencies: {},
  scripts: {
    postinstall: pkg.scripts.postinstall,
    start: 'node bin/claude-yolt'
  }
};

fs.writeFileSync('dist/package.json', JSON.stringify(prodPkg, null, 2));

// Copy necessary files
const filesToCopy = [
  'README.md',
  'LICENSE',
  'SESSION.md',
  'CLAUDE_PROCESS_SAFETY.md',
  '.npmignore'
];

filesToCopy.forEach(file => {
  if (fs.existsSync(file)) {
    fs.copyFileSync(file, path.join('dist', file));
    console.log(chalk.green(`✓ Copied ${file}`));
  }
});

// Copy lib and bin directories
function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const files = fs.readdirSync(src);
  files.forEach(file => {
    const srcPath = path.join(src, file);
    const destPath = path.join(dest, file);
    
    if (fs.statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  });
}

copyDir('lib', 'dist/lib');
copyDir('bin', 'dist/bin');
console.log(chalk.green('✓ Copied source files'));

// Copy systemd and k8s configs
if (fs.existsSync('systemd')) {
  copyDir('systemd', 'dist/systemd');
  console.log(chalk.green('✓ Copied systemd configs'));
}

if (fs.existsSync('k8s')) {
  copyDir('k8s', 'dist/k8s');
  console.log(chalk.green('✓ Copied k8s configs'));
}

// Create .npmignore if it doesn't exist
if (!fs.existsSync('.npmignore')) {
  const npmignore = `
# Development files
*.log
*.pid
.env
.env.*
node_modules/
coverage/
.nyc_output/
.git/
.github/
test/
tests/
docs/
examples/

# Build files
rust-process-manager/target/
rust-process-manager/Cargo.lock
*.rs

# IDE files
.vscode/
.idea/
*.swp
*.swo

# OS files
.DS_Store
Thumbs.db

# Session files
SESSION.md
`;
  fs.writeFileSync('.npmignore', npmignore.trim());
  console.log(chalk.green('✓ Created .npmignore'));
}

console.log(chalk.cyan('\n✨ Build complete!'));
console.log(chalk.gray('\nTo publish: cd dist && npm publish'));
console.log(chalk.gray('To test locally: cd dist && npm link'));