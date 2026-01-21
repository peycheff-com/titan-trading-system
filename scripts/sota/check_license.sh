#!/bin/bash
# Check licenses
echo "📜 Scanning Licenses..."
npx license-checker --summary --failOn "GPL;AGPL;LGPL"
