use colored::*;

fn main() {
    println!("{}", "🪂 AIRBAG MODE: Maximum safety limits".yellow());
    println!("{}", "Rust implementation not yet complete, using JS fallback...".yellow());
    
    // Delegate to JS implementation for now
    let status = std::process::Command::new("node")
        .arg(concat!(env!("CARGO_MANIFEST_DIR"), "/../bin/claude-airbag"))
        .args(std::env::args().skip(1))
        .status()
        .expect("Failed to execute JS claude-airbag");
    
    std::process::exit(status.code().unwrap_or(1));
}