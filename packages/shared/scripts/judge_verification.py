#!/usr/bin/env python3
import argparse
import json
import os
import subprocess
import sys
import time
from typing import Dict, Any, List

def run_command(command: str, cwd: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        command,
        shell=True,
        cwd=cwd,
        capture_output=True,
        text=True
    )

def analyze_node_project(service_path: str, deep_mode: bool = False) -> Dict[str, Any]:
    report = {
        "type": "node",
        "steps": [],
        "failures": [],
        "status": "PASS"
    }
    
    # 1. Lint
    start_time = time.time()
    lint_res = run_command("npm run lint", service_path)
    report["steps"].append({
        "name": "lint",
        "duration_ms": int((time.time() - start_time) * 1000),
        "exit_code": lint_res.returncode,
        "stdout": lint_res.stdout[:500],
        "stderr": lint_res.stderr[:500]
    })
    
    if lint_res.returncode != 0:
        report["status"] = "FAIL"
        report["failures"].append("Lint check failed")
        
    # 2. Unit Tests
    start_time = time.time()
    test_res = run_command("npm run test:unit", service_path)
    report["steps"].append({
        "name": "test:unit",
        "duration_ms": int((time.time() - start_time) * 1000),
        "exit_code": test_res.returncode,
        "stdout": test_res.stdout[:500],
        "stderr": test_res.stderr[:500]
    })
    
    if test_res.returncode != 0:
        report["status"] = "FAIL"
        report["failures"].append("Unit tests failed")
        
    if deep_mode:
        # Check for property tests
        pkg_path = os.path.join(service_path, "package.json")
        has_prop_test = False
        try:
            with open(pkg_path) as f:
                pkg_data = json.load(f)
                has_prop_test = "test:property" in pkg_data.get("scripts", {})
        except:
            pass
            
        if has_prop_test:
            start_time = time.time()
            # Run property tests
            prop_res = run_command("npm run test:property", service_path)
            report["steps"].append({
                "name": "test:property",
                "duration_ms": int((time.time() - start_time) * 1000),
                "exit_code": prop_res.returncode,
                "stdout": prop_res.stdout[:500],
                "stderr": prop_res.stderr[:500]
            })
            if prop_res.returncode != 0:
                report["status"] = "FAIL"
                report["failures"].append("Property tests failed")

    return report

def analyze_rust_project(service_path: str, deep_mode: bool = False) -> Dict[str, Any]:
    report = {
        "type": "rust",
        "steps": [],
        "failures": [],
        "status": "PASS"
    }
    
    # 1. Cargo Check (Fast compilation check)
    start_time = time.time()
    check_res = run_command("cargo check", service_path)
    report["steps"].append({
        "name": "cargo check",
        "duration_ms": int((time.time() - start_time) * 1000),
        "exit_code": check_res.returncode,
        "stdout": check_res.stdout[:500],
        "stderr": check_res.stderr[:500]
    })
    
    if check_res.returncode != 0:
        report["status"] = "FAIL"
        report["failures"].append("Compilation failed")
        return report # Abort if won't compile
        
    # 2. Cargo Test
    start_time = time.time()
    test_res = run_command("cargo test", service_path)
    report["steps"].append({
        "name": "cargo test",
        "duration_ms": int((time.time() - start_time) * 1000),
        "exit_code": test_res.returncode,
        "stdout": test_res.stdout[:500],
        "stderr": test_res.stderr[:500]
    })
    
    if test_res.returncode != 0:
        report["status"] = "FAIL"
        report["failures"].append("Tests failed")
        
    if deep_mode:
        # 3. Cargo Bench
        start_time = time.time()
        bench_res = run_command("cargo bench", service_path)
        report["steps"].append({
            "name": "cargo bench",
            "duration_ms": int((time.time() - start_time) * 1000),
            "exit_code": bench_res.returncode,
            "stdout": bench_res.stdout[:500],
            "stderr": bench_res.stderr[:500]
        })
        if bench_res.returncode != 0:
            report["status"] = "FAIL"
            report["failures"].append("Benchmarks failed")

        # 4. Regression / Shadow Mode
        regression_script = os.path.join(service_path, "regression_suite.sh")
        if os.path.exists(regression_script):
            start_time = time.time()
            reg_res = run_command("./regression_suite.sh", service_path)
            report["steps"].append({
                "name": "regression_suite",
                "duration_ms": int((time.time() - start_time) * 1000),
                "exit_code": reg_res.returncode,
                "stdout": reg_res.stdout[:500],
                "stderr": reg_res.stderr[:500]
            })
            if reg_res.returncode != 0:
                report["status"] = "FAIL"
                report["failures"].append("Regression suite failed")

    return report

def main():
    parser = argparse.ArgumentParser(description="Titan Judge Verification Tool")
    parser.add_argument("--service", required=True, help="Path to the service directory")
    parser.add_argument("--deep", action="store_true", help="Run deep verification (benchmarks, property tests)")
    args = parser.parse_args()
    
    service_path = os.path.abspath(args.service)
    
    if not os.path.exists(service_path):
        print(json.dumps({"error": f"Path not found: {service_path}", "status": "FAIL"}))
        sys.exit(1)
        
    if os.path.exists(os.path.join(service_path, "Cargo.toml")):
        result = analyze_rust_project(service_path, args.deep)
    elif os.path.exists(os.path.join(service_path, "package.json")):
        result = analyze_node_project(service_path, args.deep)
    else:
        result = {
            "error": "Unknown project type (no package.json or Cargo.toml)",
            "status": "FAIL"
        }
        
    print(json.dumps(result, indent=2))
    
    if result["status"] == "FAIL":
        sys.exit(1)
        
if __name__ == "__main__":
    main()
