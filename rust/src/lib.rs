// Shared functionality for claude-yolt Rust binaries

pub mod safety {
    pub struct Limits {
        pub max_mem_mb: u32,
        pub max_procs: u32,
        pub cpu_limit: u32,
        pub nice: i32,
    }
    
    pub const YOLT_LIMITS: Limits = Limits {
        max_mem_mb: 4096,
        max_procs: 50,
        cpu_limit: 1800,
        nice: 10,
    };
    
    pub const AIRBAG_LIMITS: Limits = Limits {
        max_mem_mb: 2048,
        max_procs: 20,
        cpu_limit: 300,
        nice: 15,
    };
}

pub mod router {
    pub fn detect_task_type(prompt: &str) -> &'static str {
        let lower = prompt.to_lowercase();
        
        if lower.contains("lint") || lower.contains("format") {
            "lint"
        } else if lower.contains("explain") || lower.contains("what") {
            "explain"
        } else if lower.contains("create") || lower.contains("build") {
            "create"
        } else if lower.contains("architect") || lower.contains("design") {
            "architect"
        } else {
            "debug"
        }
    }
}