import winston from 'winston';
import { ElasticsearchTransport } from 'winston-elasticsearch';

// Structured logging for production
const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    return JSON.stringify({
      '@timestamp': timestamp,
      level,
      message,
      service: 'claude-yolt',
      environment: process.env.NODE_ENV || 'development',
      hostname: process.env.HOSTNAME || require('os').hostname(),
      pid: process.pid,
      ...metadata
    });
  })
);

// Create logger with multiple transports
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { 
    service: 'claude-yolt',
    version: process.env.npm_package_version 
  },
  transports: [
    // Console output (structured for log aggregation)
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'production' 
        ? logFormat 
        : winston.format.simple()
    }),
    
    // File transport with rotation
    new winston.transports.File({
      filename: '/var/log/claude-yolt/error.log',
      level: 'error',
      maxsize: 100 * 1024 * 1024, // 100MB
      maxFiles: 5
    }),
    
    new winston.transports.File({
      filename: '/var/log/claude-yolt/combined.log',
      maxsize: 100 * 1024 * 1024,
      maxFiles: 10
    })
  ]
});

// Add Elasticsearch transport if configured
if (process.env.ELASTICSEARCH_URL) {
  logger.add(new ElasticsearchTransport({
    level: 'info',
    clientOpts: { 
      node: process.env.ELASTICSEARCH_URL,
      auth: {
        username: process.env.ELASTICSEARCH_USER,
        password: process.env.ELASTICSEARCH_PASS
      }
    },
    index: 'claude-yolt',
    dataStream: true
  }));
}

// Log process events
export function logProcessEvent(event, data) {
  logger.info('process_event', {
    event_type: event,
    pid: data.pid,
    command: data.command,
    duration_ms: data.duration,
    exit_code: data.exitCode,
    killed: data.killed,
    queue_depth: data.queueDepth,
    active_processes: data.activeProcesses
  });
}

// Log errors with context
export function logError(error, context) {
  logger.error('error_occurred', {
    error_type: error.constructor.name,
    error_message: error.message,
    error_stack: error.stack,
    context,
    correlation_id: context.correlationId
  });
}

// Audit logging for security
export function logAudit(action, details) {
  logger.info('audit_event', {
    audit_action: action,
    user: process.env.USER,
    timestamp: new Date().toISOString(),
    details
  });
}