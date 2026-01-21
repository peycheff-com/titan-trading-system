import os
import re
import sys

# Regex patterns for common secrets
PATTERNS = {
    'RSA Private Key': r'-----BEGIN RSA PRIVATE KEY-----',
    'OpenSSH Private Key': r'-----BEGIN OPENSSH PRIVATE KEY-----',
    'GitHub Token': r'ghp_[a-zA-Z0-9]{36}',
    'AWS Access Key': r'AKIA[0-9A-Z]{16}',
    'Stripe Secret': r'sk_live_[0-9a-zA-Z]{24}',
    'Google API Key': r'AIza[0-9A-Za-z\\-_]{35}',
    'Generic Private Key': r'private_key[\'"]?\s*[:=]\s*[\'"][^\'"]{20,}[\'"]'
}

def scan_secrets(root_dir):
    print("🕵️‍♂️ Scanning for Secrets in codebase...")
    issues = []
    
    # Files to explicitly ignore
    IGNORE_FILES = ['package-lock.json', 'yarn.lock', '.DS_Store']
    
    for dirpath, _, filenames in os.walk(root_dir):
        # Ignore common non-source directories
        if any(x in dirpath for x in ['node_modules', '.git', 'dist', 'build', '.genkit', 'coverage']):
            continue
            
        for f in filenames:
            if f in IGNORE_FILES: continue
            if f.endswith('.map') or f.endswith('.png') or f.endswith('.ico') or f.endswith('.pyc'): continue
            
            fullname = os.path.join(dirpath, f)
            relpath = os.path.relpath(fullname, root_dir)
            
            # Skip artifacts and logs
            if relpath.startswith('artifacts/') or relpath.startswith('logs/'):
                continue

            try:
                with open(fullname, 'r', encoding='utf-8', errors='ignore') as file:
                    content = file.read()
                    for name, pattern in PATTERNS.items():
                        if re.search(pattern, content):
                            # Check if it's likely a test file or example
                            if 'test' in relpath.lower() or 'example' in relpath.lower():
                                continue
                            issues.append((name, relpath))
            except Exception as e:
                pass

    if issues:
        print(f"\n❌ Found {len(issues)} potential secrets (excluding tests/examples):")
        for name, path in issues:
            print(f"  [{name.ljust(20)}] {path}")
        # Make it strict? Or just warn.
        # sys.exit(1) 
    else:
        print("\n✅ No secrets found.")

if __name__ == "__main__":
    scan_secrets(os.getcwd())
