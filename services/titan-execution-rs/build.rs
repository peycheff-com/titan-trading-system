use std::env;
use std::fs;
use std::path::Path;

fn main() {
    // Re-run if the shared policy file changes
    println!("cargo:rerun-if-changed=../../packages/shared/risk_policy.json");

    let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
    let source_path = Path::new(&manifest_dir).join("../../packages/shared/risk_policy.json");
    let dest_path = Path::new(&manifest_dir).join("src/risk_policy.json");

    match fs::copy(&source_path, &dest_path) {
        Ok(_) => println!("Successfully synced risk_policy.json from shared to execution-rs"),
        Err(e) => panic!(
            "Failed to copy risk_policy.json from {:?} to {:?}: {}",
            source_path, dest_path, e
        ),
    }
}
