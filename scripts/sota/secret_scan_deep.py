
import subprocess
import re
import sys

# Patterns to scan for
PATTERNS = {
    "AWS Access Key": r"AKIA[0-9A-Z]{16}",
    "Private Key": r"-----BEGIN (RSA|DSA|EC|OPENSSH) PRIVATE KEY-----",
    "Generic API Key": r"api_key\s*[:=]\s*['\"][a-zA-Z0-9]{32,}['\"]",
}

def scan_git_history():
    print("🔍 Scanning Git History for Secrets...")
    try:
        # Scan last 100 commits to avoid indefinite run time interactively
        # In CI, this could be configurable
        log_output = subprocess.check_output(
            ["git", "log", "-p", "-n", "100"], 
            text=True, 
            errors="ignore"
        )
    except subprocess.CalledProcessError:
        print("⚠️  Not a git repository or git error.")
        return 0

    found_issues = False
    
    for line_idx, line in enumerate(log_output.splitlines()):
        # Only check added lines
        if not line.startswith("+"):
            continue
            
        for name, pattern in PATTERNS.items():
            if re.search(pattern, line):
                print(f"❌ Potential {name} found in history!")
                # Don't print the secret itself in logs, show context if needed securely
                # print(f"Context: {line[:50]}...") 
                found_issues = True

    if found_issues:
        print("❌ Secrets found in git history! Please rotate them and rewrite history (BFG/filter-branch).")
        return 1
    
    print("✅ No secrets found in recent history.")
    return 0

if __name__ == "__main__":
    sys.exit(scan_git_history())
