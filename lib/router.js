import chalk from 'chalk';
import { execSync } from 'child_process';

// Model configurations with cost tiers
export const MODELS = {
  // Tier 1: Expensive but powerful
  claude: {
    provider: 'claude',
    cost: 'high',
    capabilities: ['reasoning', 'coding', 'analysis', 'creative'],
    command: 'claude'
  },
  
  // Tier 2: Medium cost
  openrouter: {
    provider: 'openrouter',
    cost: 'medium',
    capabilities: ['coding', 'analysis'],
    env: 'OPENROUTER_API_KEY',
    endpoint: 'https://openrouter.ai/api/v1'
  },
  
  // Tier 3: Free/cheap options
  github: {
    provider: 'github',
    cost: 'free',
    capabilities: ['coding', 'linting'],
    env: 'GITHUB_TOKEN',
    endpoint: 'https://models.inference.ai.azure.com'
  },
  
  ollama: {
    provider: 'ollama',
    cost: 'free',
    capabilities: ['coding', 'linting'],
    models: ['qwen2.5-coder:3b', 'codellama:7b'],
    command: 'ollama'
  },
  
  // Local tools (no AI needed)
  local: {
    provider: 'local',
    cost: 'none',
    capabilities: ['lint', 'format', 'check']
  }
};

// Task to model mapping
export const TASK_MODELS = {
  // Local tools first
  lint: ['local', 'ollama', 'github'],
  format: ['local', 'ollama', 'github'],
  check: ['local', 'ollama', 'github'],
  
  // Simple tasks use free models
  syntax: ['ollama', 'github', 'openrouter'],
  
  // Medium tasks
  refactor: ['github', 'openrouter', 'claude'],
  explain: ['github', 'openrouter', 'claude'],
  
  // Complex tasks need Claude
  architect: ['claude'],
  debug: ['claude', 'openrouter'],
  create: ['claude', 'openrouter']
};

// Local tool mappings
const LOCAL_TOOLS = {
  // JavaScript/TypeScript
  'eslint': /\.(js|jsx|ts|tsx)$/,
  'prettier': /\.(js|jsx|ts|tsx|json|md|yaml|yml)$/,
  'tsc': /\.(ts|tsx)$/,
  
  // Rust
  'rustfmt': /\.rs$/,
  'clippy': /\.rs$/,
  
  // Python
  'black': /\.py$/,
  'flake8': /\.py$/,
  'mypy': /\.py$/,
  
  // Go
  'gofmt': /\.go$/,
  'golint': /\.go$/,
  
  // General
  'oxlint': /\.(js|jsx|ts|tsx)$/,
  'dprint': /\.(js|jsx|ts|tsx|json|md)$/
};

// Detect task type from prompt
export function detectTaskType(prompt) {
  const lower = prompt.toLowerCase();
  
  // Linting/formatting tasks
  if (/\b(lint|format|fmt|style|prettier|eslint|rustfmt|clippy|black|flake8)\b/.test(lower)) {
    return 'lint';
  }
  
  // Type/syntax checking
  if (/\b(check|typecheck|tsc|mypy)\b/.test(lower)) {
    return 'check';
  }
  
  // Syntax errors
  if (/\b(syntax|compile|build|error|warning)\b/.test(lower)) {
    return 'syntax';
  }
  
  // Refactoring
  if (/\b(refactor|rename|extract|inline)\b/.test(lower)) {
    return 'refactor';
  }
  
  // Explanation
  if (/\b(explain|what|how|why|understand)\b/.test(lower)) {
    return 'explain';
  }
  
  // Architecture/design
  if (/\b(architect|design|structure|pattern)\b/.test(lower)) {
    return 'architect';
  }
  
  // Creation
  if (/\b(create|write|implement|build)\b/.test(lower)) {
    return 'create';
  }
  
  // Default to complex
  return 'debug';
}

// Try to use local tool
export function tryLocalTool(prompt, files) {
  const taskType = detectTaskType(prompt);
  
  if (taskType === 'lint' || taskType === 'format' || taskType === 'check') {
    // Try to find appropriate local tool
    for (const [tool, pattern] of Object.entries(LOCAL_TOOLS)) {
      // Check if tool exists
      try {
        execSync(`which ${tool}`, { stdio: 'ignore' });
      } catch {
        continue;
      }
      
      // Check if any file matches pattern
      const matchingFiles = files.filter(f => pattern.test(f));
      if (matchingFiles.length > 0) {
        return {
          tool,
          files: matchingFiles,
          command: buildLocalCommand(tool, matchingFiles)
        };
      }
    }
  }
  
  return null;
}

// Build local tool command
function buildLocalCommand(tool, files) {
  const fileList = files.join(' ');
  
  switch (tool) {
    case 'eslint':
      return `eslint --fix ${fileList}`;
    case 'prettier':
      return `prettier --write ${fileList}`;
    case 'tsc':
      return `tsc --noEmit ${fileList}`;
    case 'rustfmt':
      return `rustfmt ${fileList}`;
    case 'clippy':
      return `cargo clippy`;
    case 'black':
      return `black ${fileList}`;
    case 'flake8':
      return `flake8 ${fileList}`;
    case 'mypy':
      return `mypy ${fileList}`;
    case 'gofmt':
      return `gofmt -w ${fileList}`;
    case 'golint':
      return `golint ${fileList}`;
    case 'oxlint':
      return `oxlint --fix ${fileList}`;
    case 'dprint':
      return `dprint fmt ${fileList}`;
    default:
      return `${tool} ${fileList}`;
  }
}

// Select best available model
export function selectModel(taskType, preferredModel) {
  // If user specified a model, use it
  if (preferredModel && MODELS[preferredModel]) {
    return { ...MODELS[preferredModel], name: preferredModel };
  }
  
  // Get suitable models for task
  const suitableModels = TASK_MODELS[taskType] || ['claude'];
  
  // Find first available model
  for (const modelName of suitableModels) {
    const model = MODELS[modelName];
    
    // Skip local for now (handled separately)
    if (modelName === 'local') continue;
    
    // Check if model is available
    if (model.env && !process.env[model.env]) continue;
    if (model.command) {
      try {
        execSync(`which ${model.command}`, { stdio: 'ignore' });
      } catch {
        continue;
      }
    }
    
    return { ...model, name: modelName };
  }
  
  // Fallback to Claude
  return { ...MODELS.claude, name: 'claude' };
}

// Route request to appropriate model
export function routeRequest(prompt, options = {}) {
  const taskType = options.taskType || detectTaskType(prompt);
  
  // Try local tool first if files provided
  if (options.files) {
    const localResult = tryLocalTool(prompt, options.files);
    if (localResult) {
      console.log(chalk.blue(`📊 Task type: ${taskType}`));
      console.log(chalk.green(`🔧 Using local tool: ${localResult.tool}`));
      console.log(chalk.green('✨ No AI needed!'));
      return { ...MODELS.local, ...localResult };
    }
  }
  
  const model = selectModel(taskType, options.model);
  
  console.log(chalk.blue(`📊 Task type: ${taskType}`));
  console.log(chalk.green(`🤖 Using model: ${model.name} (${model.cost} cost)`));
  
  if (model.cost === 'free') {
    console.log(chalk.green('💰 Using FREE model!'));
  } else if (model.cost === 'medium') {
    console.log(chalk.yellow('💵 Using medium-cost model'));
  } else {
    console.log(chalk.red('💸 Using expensive model'));
  }
  
  return model;
}