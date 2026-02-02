
import json
import sys
import os

def generate_override(digests_path, output_path):
    if not os.path.exists(digests_path):
        print(f"Error: {digests_path} not found")
        sys.exit(1)

    with open(digests_path, 'r') as f:
        try:
            digests = json.load(f)
        except json.JSONDecodeError as e:
            print(f"Error decoding JSON: {e}")
            sys.exit(1)

    with open(output_path, 'w') as f:
        f.write("services:\n")
        for service, image_ref in digests.items():
            f.write(f"  {service}:\n")
            f.write(f"    image: {image_ref}\n")
    
    print(f"Generated {output_path} with {len(digests)} services.")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: generate_digest_override.py <digests.json> <output.yml>")
        sys.exit(1)
    
    generate_override(sys.argv[1], sys.argv[2])
