use clap::Parser;
use colored::*;

#[derive(Parser)]
#[command(name = "claude-router")]
#[command(about = "Intelligent task routing for Claude CLI")]
struct Args {
    /// The prompt or command
    prompt: Vec<String>,
}

fn main() {
    let args = Args::parse();
    let prompt = args.prompt.join(" ");
    
    if prompt.is_empty() {
        eprintln!("{}", "Usage: claude-router <prompt>".red());
        std::process::exit(1);
    }
    
    println!("{}", "🧠 ROUTER MODE: Intelligent task routing".blue());
    
    // For now, just delegate to claude-yolt
    println!("{}", "Routing to claude-yolt...".cyan());
    
    let status = std::process::Command::new("claude-yolt")
        .args(&args.prompt)
        .status()
        .expect("Failed to execute claude-yolt");
    
    std::process::exit(status.code().unwrap_or(1));
}