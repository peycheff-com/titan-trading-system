import os
import subprocess
import json

def scan_zombies(root_dir):
    print("🧟‍♀️ Scanning for Zombie Dependencies (depcheck)...")
    
    services_dir = os.path.join(root_dir, 'services')
    if not os.path.exists(services_dir):
        print("No services directory found.")
        return

    services = [d for d in os.listdir(services_dir) if os.path.isdir(os.path.join(services_dir, d))]
    
    for service in services:
        service_path = os.path.join(services_dir, service)
        # Skip rust services or non-js
        if not os.path.exists(os.path.join(service_path, 'package.json')):
            continue
            
        print(f"\n🔍 Checking {service}...")
        try:
            # Run depcheck
            # We ignore some common dev tool patterns
            cmd = ["npx", "depcheck", "--json", "--ignores=eslint*,prettier*,typescript,ts-node,@types/*,jest*,vite*,@vitejs/*"]
            result = subprocess.run(cmd, cwd=service_path, capture_output=True, text=True)
            
            output = result.stdout
            try:
                data = json.loads(output)
                unused = data.get('dependencies', [])
                unused_dev = data.get('devDependencies', [])
                
                if unused:
                    print(f"  ❌ Unused Dependencies: {', '.join(unused)}")
                else:
                    print("  ✅ Dependencies Clean")
                    
                if unused_dev:
                    print(f"  ⚠️  Unused DevDependencies: {', '.join(unused_dev)}")
            except json.JSONDecodeError:
                print(f"  ❌ Failed to parse depcheck output for {service}")
                
        except Exception as e:
            print(f"  ❌ Error: {e}")

if __name__ == "__main__":
    scan_zombies(os.getcwd())
