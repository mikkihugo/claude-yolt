use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::Path;
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;
use tracing::{error, info};

const SOCKET_PATH: &str = "/tmp/claude-process-guard.sock";

#[derive(Debug, Serialize, Deserialize)]
pub enum ProcessCommand {
    Register {
        pid: i32,
        command: String,
        args: Vec<String>,
    },
    Unregister {
        pid: i32,
    },
    QueryStatus,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProcessStatus {
    pub active_count: usize,
    pub queue_depth: usize,
    pub should_throttle: bool,
}

pub fn start_ipc_server(tx: mpsc::UnboundedSender<ProcessCommand>) -> std::io::Result<()> {
    // Remove old socket if exists
    let _ = std::fs::remove_file(SOCKET_PATH);
    
    let listener = UnixListener::bind(SOCKET_PATH)?;
    info!("IPC server listening on {}", SOCKET_PATH);
    
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            match stream {
                Ok(stream) => {
                    let tx = tx.clone();
                    std::thread::spawn(move || {
                        handle_client(stream, tx);
                    });
                }
                Err(e) => error!("IPC connection error: {}", e),
            }
        }
    });
    
    Ok(())
}

fn handle_client(mut stream: UnixStream, tx: mpsc::UnboundedSender<ProcessCommand>) {
    let reader = BufReader::new(stream.try_clone().unwrap());
    
    for line in reader.lines() {
        match line {
            Ok(data) => {
                match serde_json::from_str::<ProcessCommand>(&data) {
                    Ok(cmd) => {
                        if let Err(e) = tx.send(cmd) {
                            error!("Failed to send command: {}", e);
                        }
                    }
                    Err(e) => error!("Failed to parse command: {}", e),
                }
            }
            Err(e) => {
                error!("Failed to read from client: {}", e);
                break;
            }
        }
    }
}