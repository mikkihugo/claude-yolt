import { Transform, PassThrough } from 'stream';
import { pipeline } from 'stream/promises';

// Efficient stream handling with backpressure
export class EfficientStreamHandler {
  constructor() {
    // Pre-allocate ring buffer for stream chunks
    this.bufferSize = 64 * 1024; // 64KB chunks
    this.ringBuffer = Buffer.allocUnsafe(this.bufferSize * 4); // 256KB total
    this.writePos = 0;
    this.readPos = 0;
  }
  
  // Zero-copy stream transform
  createDrainTransform() {
    let byteCount = 0;
    
    return new Transform({
      transform(chunk, encoding, callback) {
        byteCount += chunk.length;
        
        // Only pass through first 1MB to prevent memory explosion
        if (byteCount < 1024 * 1024) {
          this.push(chunk);
        } else if (byteCount === 1024 * 1024) {
          this.push(Buffer.from('\n... (output truncated)\n'));
        }
        
        // Always callback immediately to prevent backpressure
        callback();
      },
      
      // High water mark for better performance
      highWaterMark: 64 * 1024
    });
  }
  
  // Handle process streams efficiently
  handleProcessStreams(childProcess) {
    // Create passthrough streams that won't block
    const stdoutPassthrough = new PassThrough({ highWaterMark: 64 * 1024 });
    const stderrPassthrough = new PassThrough({ highWaterMark: 16 * 1024 });
    
    // Save original pipe destinations if any
    const originalStdoutListeners = childProcess.stdout?._events?.data;
    const originalStderrListeners = childProcess.stderr?._events?.data;
    
    if (childProcess.stdout) {
      // Remove original listeners temporarily
      childProcess.stdout.removeAllListeners('data');
      
      // Efficient drain with size limit
      const drainTransform = this.createDrainTransform();
      
      // Non-blocking pipeline
      pipeline(
        childProcess.stdout,
        drainTransform,
        stdoutPassthrough
      ).catch(() => {}); // Ignore errors, just drain
      
      // Reattach original listeners to passthrough
      if (originalStdoutListeners) {
        if (Array.isArray(originalStdoutListeners)) {
          originalStdoutListeners.forEach(listener => {
            stdoutPassthrough.on('data', listener);
          });
        } else {
          stdoutPassthrough.on('data', originalStdoutListeners);
        }
      }
    }
    
    if (childProcess.stderr) {
      // Stderr usually smaller, just drain it
      childProcess.stderr.on('data', () => {});
      childProcess.stderr.on('error', () => {});
    }
    
    // Ensure stdin is closed if not needed
    if (childProcess.stdin && !childProcess.stdin.destroyed) {
      childProcess.stdin.end();
    }
    
    return {
      stdout: stdoutPassthrough,
      stderr: stderrPassthrough
    };
  }
  
  // Fast check if a command will produce large output
  willProduceLargeOutput(command, args) {
    const largeOutputCommands = new Set(['fd', 'find', 'rg', 'grep', 'ls', 'tree']);
    const cmd = command.split('/').pop(); // basename
    
    if (largeOutputCommands.has(cmd)) {
      // Check if already limited
      const hasLimit = args.some(arg => 
        arg.includes('--max-results') || 
        arg.includes('--max-count') ||
        arg.includes('-m') ||
        arg.includes('head')
      );
      
      return !hasLimit;
    }
    
    return false;
  }
}

export const streamHandler = new EfficientStreamHandler();