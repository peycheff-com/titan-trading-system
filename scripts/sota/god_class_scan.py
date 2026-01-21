import os

def count_lines(filepath):
    """Count non-empty, non-comment lines."""
    count = 0
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('//') and not line.startswith('/*') and not line.startswith('*'):
                count += 1
    return count

def scan_god_classes(root_dir, threshold=400):
    print(f"🧙‍♂️ Scanning for God Classes (> {threshold} lines of code)...")
    god_classes = []
    
    for dirpath, _, filenames in os.walk(root_dir):
        if 'node_modules' in dirpath or 'dist' in dirpath or '.git' in dirpath:
            continue
            
        for f in filenames:
            if f.endswith('.ts') or f.endswith('.tsx'):
                full_path = os.path.join(dirpath, f)
                loc = count_lines(full_path)
                if loc > threshold:
                    rel_path = os.path.relpath(full_path, root_dir)
                    god_classes.append((loc, rel_path))

    god_classes.sort(reverse=True, key=lambda x: x[0])
    
    print(f"\n⚡ Found {len(god_classes)} potential God Classes:")
    print(f"{'LOC'.ljust(10)} | {'File'}")
    print("-" * 60)
    for loc, path in god_classes:
        print(f"{str(loc).ljust(10)} | {path}")

if __name__ == "__main__":
    scan_god_classes(os.getcwd())
