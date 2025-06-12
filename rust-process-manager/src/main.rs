use dashmap::DashMap;
use nix::sys::signal::{self, Signal};
use nix::unistd::Pid;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use sysinfo::{System, Process, Pid as SysinfoPid};
use tokio::sync::Semaphore;
use tokio::time;
use tracing::{error, info, warn};

const MAX_CONCURRENT: usize = 200;
const HANG_CHECK_INTERVAL: Duration = Duration::from_secs(5);

#[derive(Debug, Clone)]
struct ProcessInfo {
    pid: i32,
    command: String,
    started: Instant,
}

struct ProcessManager {
    active_processes: Arc<DashMap<i32, ProcessInfo>>,
    queue_depth: Arc<AtomicUsize>,
    semaphore: Arc<Semaphore>,
}

impl ProcessManager {
    fn new() -> Self {
        Self {
            active_processes: Arc::new(DashMap::new()),
            queue_depth: Arc::new(AtomicUsize::new(0)),
            semaphore: Arc::new(Semaphore::new(MAX_CONCURRENT)),
        }
    }

    async fn monitor_loop(&self) {
        let mut interval = time::interval(HANG_CHECK_INTERVAL);
        
        loop {
            interval.tick().await;
            
            let queue_size = self.queue_depth.load(Ordering::Relaxed);
            
            if queue_size > 1000 {
                warn!("Queue depth at {} processes!", queue_size);
                self.check_hanging_processes().await;
            }
        }
    }

    async fn check_hanging_processes(&self) {
        let now = Instant::now();
        let mut to_remove = Vec::new();
        
        for entry in self.active_processes.iter() {
            let (pid, info) = entry.pair();
            
            // Quick check if process still exists
            if !process_exists(*pid) {
                to_remove.push(*pid);
            } else {
                // Check if hung (>2 minutes)
                if now.duration_since(info.started) > Duration::from_secs(120) {
                    warn!("Process {} appears hung", pid);
                }
            }
        }
        
        // Clean up dead processes
        for pid in to_remove {
            self.active_processes.remove(&pid);
            self.semaphore.add_permits(1);
        }
    }

    async fn register_process(&self, pid: i32, command: String) -> Result<(), String> {
        // Increment queue depth
        self.queue_depth.fetch_add(1, Ordering::Relaxed);
        
        // Wait for available slot
        let permit = self.semaphore.acquire().await
            .map_err(|e| format!("Failed to acquire semaphore: {}", e))?;
        
        // Decrement queue depth
        self.queue_depth.fetch_sub(1, Ordering::Relaxed);
        
        let info = ProcessInfo {
            pid,
            command,
            started: Instant::now(),
        };
        
        self.active_processes.insert(pid, info);
        
        // Forget the permit - we'll manually add it back when process exits
        std::mem::forget(permit);
        
        Ok(())
    }

    async fn unregister_process(&self, pid: i32) {
        if self.active_processes.remove(&pid).is_some() {
            self.semaphore.add_permits(1);
        }
    }
}

fn process_exists(pid: i32) -> bool {
    match signal::kill(Pid::from_raw(pid), None) {
        Ok(_) => true,
        Err(_) => false,
    }
}

fn kill_process(pid: i32) -> bool {
    let pid_nix = Pid::from_raw(pid);
    
    // Try SIGTERM first
    if let Err(e) = signal::kill(pid_nix, Signal::SIGTERM) {
        error!("Failed to send SIGTERM to {}: {}", pid, e);
        return false;
    }
    
    // Give it 2 seconds to clean up
    std::thread::sleep(Duration::from_secs(2));
    
    // Check if still alive and force kill
    if process_exists(pid) {
        if let Err(e) = signal::kill(pid_nix, Signal::SIGKILL) {
            error!("Failed to send SIGKILL to {}: {}", pid, e);
            return false;
        }
    }
    
    true
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();
    
    info!("Claude Process Guard starting...");
    info!("Max concurrent processes: {}", MAX_CONCURRENT);
    
    let manager = Arc::new(ProcessManager::new());
    
    // Start monitoring task
    let monitor_manager = manager.clone();
    tokio::spawn(async move {
        monitor_manager.monitor_loop().await;
    });
    
    // Keep running
    tokio::signal::ctrl_c().await.unwrap();
    info!("Shutting down process guard...");
}