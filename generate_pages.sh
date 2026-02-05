#!/bin/bash
mkdir -p design-system/pages

pages=("dashboard" "venues" "keys" "risk-policy" "deployments" "execution" "incidents" "evidence" "setup")

for page in "${pages[@]}"; do
  cat > "design-system/pages/$page.md" <<EOF
# Page: $page
> Extends [MASTER](../MASTER.md)

## Layout
- Follows standard Shell layout.

## Specific Components
- [ ] Define specific components for $page if needed.

## Deviations
- None (currently strict adherence to Master).
EOF
done

echo "Generated ${#pages[@]} page overrides."
