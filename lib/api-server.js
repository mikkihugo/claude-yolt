import express from 'express';
import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import chalk from 'chalk';
import { loadConfig } from './config.js';
import { detectTaskType } from './router.js';

const app = express();
app.use(express.json());

// Store active streams
const activeStreams = new Map();

// API key middleware
app.use((req, res, next) => {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return next(); // No key required
  }
  
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: {
        message: 'Missing authorization header',
        type: 'authentication_error'
      }
    });
  }
  
  const providedKey = authHeader.substring(7);
  if (providedKey !== apiKey) {
    return res.status(401).json({
      error: {
        message: 'Invalid API key',
        type: 'authentication_error'
      }
    });
  }
  
  next();
});

// OpenAI-compatible chat completions endpoint
app.post('/v1/chat/completions', async (req, res) => {
  const {
    messages,
    model = 'claude-3-opus-20240229',
    stream = false,
    temperature = 0.7,
    max_tokens = 4096
  } = req.body;
  
  // Get the last user message as the prompt
  const userMessages = messages.filter(m => m.role === 'user');
  if (userMessages.length === 0) {
    return res.status(400).json({
      error: {
        message: 'No user message found',
        type: 'invalid_request_error'
      }
    });
  }
  
  const prompt = userMessages[userMessages.length - 1].content;
  const config = loadConfig();
  
  // Determine which claude mode to use based on model name or config
  let mode = config.defaultMode;
  if (model.includes('yolo')) mode = 'yolo';
  else if (model.includes('safe') || model.includes('airbag')) mode = 'airbag';
  else if (model.includes('router')) mode = 'router';
  
  console.log(chalk.cyan(`API request: mode=${mode}, prompt="${prompt.substring(0, 50)}..."`));
  
  if (stream) {
    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    
    const streamId = uuidv4();
    let buffer = '';
    
    // Spawn claude process
    const claude = spawn(`claude-${mode}`, [prompt], {
      shell: true
    });
    
    activeStreams.set(streamId, claude);
    
    // Handle stdout
    claude.stdout.on('data', (data) => {
      buffer += data.toString();
      
      // Send chunks as they come
      const chunk = {
        id: `chatcmpl-${streamId}`,
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: model,
        choices: [{
          index: 0,
          delta: {
            content: data.toString()
          },
          finish_reason: null
        }]
      };
      
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    });
    
    // Handle completion
    claude.on('close', (code) => {
      activeStreams.delete(streamId);
      
      // Send final chunk
      const finalChunk = {
        id: `chatcmpl-${streamId}`,
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: model,
        choices: [{
          index: 0,
          delta: {},
          finish_reason: 'stop'
        }]
      };
      
      res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    });
    
    // Handle errors
    claude.stderr.on('data', (data) => {
      console.error(chalk.red(`Claude error: ${data}`));
    });
    
    // Handle client disconnect
    req.on('close', () => {
      if (activeStreams.has(streamId)) {
        activeStreams.get(streamId).kill();
        activeStreams.delete(streamId);
      }
    });
    
  } else {
    // Non-streaming response
    let output = '';
    let error = '';
    
    const claude = spawn(`claude-${mode}`, [prompt], {
      shell: true
    });
    
    claude.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    claude.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    claude.on('close', (code) => {
      if (code !== 0) {
        return res.status(500).json({
          error: {
            message: error || 'Claude process failed',
            type: 'internal_error'
          }
        });
      }
      
      // Return OpenAI-compatible response
      res.json({
        id: `chatcmpl-${uuidv4()}`,
        object: 'chat.completion',
        created: Date.now(),
        model: model,
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: output.trim()
          },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: prompt.length,
          completion_tokens: output.length,
          total_tokens: prompt.length + output.length
        }
      });
    });
  }
});

// Models endpoint
app.get('/v1/models', (req, res) => {
  const config = loadConfig();
  
  res.json({
    object: 'list',
    data: [
      {
        id: 'claude-3-opus-20240229',
        object: 'model',
        created: Date.now(),
        owned_by: 'claude-yolt',
        permission: [],
        root: 'claude-3-opus-20240229',
        parent: null
      },
      {
        id: 'claude-yolo',
        object: 'model',
        created: Date.now(),
        owned_by: 'claude-yolt',
        permission: [],
        root: 'claude-yolo',
        parent: null
      },
      {
        id: 'claude-safe',
        object: 'model',
        created: Date.now(),
        owned_by: 'claude-yolt',
        permission: [],
        root: 'claude-safe',
        parent: null
      },
      {
        id: 'claude-router',
        object: 'model',
        created: Date.now(),
        owned_by: 'claude-yolt',
        permission: [],
        root: 'claude-router',
        parent: null
      }
    ]
  });
});

// Completions endpoint (legacy)
app.post('/v1/completions', async (req, res) => {
  const { prompt, model, stream = false } = req.body;
  
  // Convert to chat format
  req.body = {
    messages: [{ role: 'user', content: prompt }],
    model,
    stream
  };
  
  // Forward to chat completions
  return app._router.handle(req, res);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', mode: loadConfig().defaultMode });
});

export function startApiServer(port = 3000) {
  app.listen(port, () => {
    console.log(chalk.green(`\n🚀 Claude-YOLT API Server`));
    console.log(chalk.cyan(`OpenAI-compatible API running on http://localhost:${port}`));
    console.log(chalk.gray('\nEndpoints:'));
    console.log('  POST /v1/chat/completions');
    console.log('  POST /v1/completions');
    console.log('  GET  /v1/models');
    console.log('  GET  /health\n');
  });
}