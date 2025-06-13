import { register, Counter, Gauge, Histogram, Summary } from 'prom-client';
import express from 'express';

// Metrics definitions
export const metrics = {
  // Process management metrics
  processesSpawned: new Counter({
    name: 'claude_yolt_processes_spawned_total',
    help: 'Total number of processes spawned',
    labelNames: ['command', 'status']
  }),
  
  processesActive: new Gauge({
    name: 'claude_yolt_processes_active',
    help: 'Number of currently active processes',
    labelNames: ['command']
  }),
  
  processesQueued: new Gauge({
    name: 'claude_yolt_processes_queued',
    help: 'Number of processes waiting in queue'
  }),
  
  processesKilled: new Counter({
    name: 'claude_yolt_processes_killed_total',
    help: 'Total number of processes killed',
    labelNames: ['reason', 'command']
  }),
  
  // Performance metrics
  spawnDuration: new Histogram({
    name: 'claude_yolt_spawn_duration_seconds',
    help: 'Time taken to spawn a process',
    labelNames: ['command'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10]
  }),
  
  queueWaitTime: new Summary({
    name: 'claude_yolt_queue_wait_seconds',
    help: 'Time processes spend waiting in queue',
    maxAgeSeconds: 600,
    ageBuckets: 5
  }),
  
  // Resource metrics
  memoryUsage: new Gauge({
    name: 'claude_yolt_memory_usage_bytes',
    help: 'Memory usage of the claude-yolt process'
  }),
  
  cpuUsage: new Gauge({
    name: 'claude_yolt_cpu_usage_percent',
    help: 'CPU usage percentage'
  }),
  
  // Bug workaround metrics
  bugsDetected: new Counter({
    name: 'claude_yolt_bugs_detected_total',
    help: 'Known bugs detected and fixed',
    labelNames: ['bug_type']
  }),
  
  authRefreshes: new Counter({
    name: 'claude_yolt_auth_refreshes_total',
    help: 'Number of times auth was refreshed'
  }),
  
  // Error metrics
  errors: new Counter({
    name: 'claude_yolt_errors_total',
    help: 'Total number of errors',
    labelNames: ['type', 'severity']
  })
};

// Metrics server
export function startMetricsServer(port = 9090) {
  const app = express();
  
  // Prometheus metrics endpoint
  app.get('/metrics', async (req, res) => {
    try {
      // Update runtime metrics
      const usage = process.memoryUsage();
      metrics.memoryUsage.set(usage.heapUsed);
      
      const cpuUsage = process.cpuUsage();
      metrics.cpuUsage.set((cpuUsage.user + cpuUsage.system) / 1000000);
      
      res.set('Content-Type', register.contentType);
      res.end(await register.metrics());
    } catch (err) {
      res.status(500).end(err);
    }
  });
  
  // Health check endpoint
  app.get('/health', (req, res) => {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || 'unknown'
    };
    res.json(health);
  });
  
  // Readiness check
  app.get('/ready', (req, res) => {
    // Check if we can process
    const ready = metrics.processesActive._value < 1000;
    if (ready) {
      res.json({ ready: true });
    } else {
      res.status(503).json({ ready: false, reason: 'too many active processes' });
    }
  });
  
  app.listen(port, () => {
    console.log(`Metrics server listening on port ${port}`);
  });
}

// Collect default metrics
register.setDefaultLabels({
  app: 'claude-yolt',
  version: process.env.npm_package_version || 'unknown'
});

// Update metrics every 10 seconds
setInterval(() => {
  try {
    register.collectDefaultMetrics();
  } catch (e) {
    // Ignore metrics collection errors
  }
}, 10000);