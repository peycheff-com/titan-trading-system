---
name: "jq-cli-guide"
displayName: "jq CLI Guide"
description: "Complete guide for using jq command-line JSON processor with common patterns and troubleshooting"
keywords: ["jq", "json", "cli", "parsing", "filtering"]
author: "Kiro Assistant"
---

# jq CLI Guide

## Overview

jq is a lightweight and flexible command-line JSON processor. It's like `sed` for JSON data - you can use it to slice, filter, map, and transform structured data with ease. This power provides installation instructions, common usage patterns, and troubleshooting for the jq CLI tool.

Whether you're parsing API responses, transforming configuration files, or extracting specific data from complex JSON structures, jq provides a powerful query language to accomplish these tasks efficiently.

## Onboarding

### Installation

#### Via Homebrew (macOS)
```bash
brew install jq
```

#### Via apt (Ubuntu/Debian)
```bash
sudo apt-get update
sudo apt-get install jq
```

#### Via yum (CentOS/RHEL)
```bash
sudo yum install jq
```

#### Via Download (All platforms)
Download from: https://stedolan.github.io/jq/download/

### Prerequisites
- No special prerequisites required
- Works on macOS, Linux, and Windows
- Compatible with any JSON data source

### Verification
```bash
# Verify installation
jq --version

# Expected output:
jq-1.6 (or similar version)
```

## Common Workflows

### Workflow: Basic JSON Parsing

**Goal:** Extract specific fields from JSON data

**Commands:**
```bash
# Pretty print JSON
echo '{"name":"John","age":30}' | jq '.'

# Extract a specific field
echo '{"name":"John","age":30}' | jq '.name'

# Extract multiple fields
echo '{"name":"John","age":30,"city":"NYC"}' | jq '.name, .age'
```

**Complete Example:**
```bash
# Parse API response and extract user names
curl -s https://jsonplaceholder.typicode.com/users | jq '.[].name'
```

### Workflow: Array Processing

**Goal:** Work with JSON arrays and filter data

**Commands:**
```bash
# Get array length
echo '[1,2,3,4,5]' | jq 'length'

# Filter array elements
echo '[1,2,3,4,5]' | jq '.[] | select(. > 3)'

# Map over array elements
echo '[1,2,3]' | jq 'map(. * 2)'
```

**Complete Example:**
```bash
# Get all users over age 25
echo '[{"name":"John","age":30},{"name":"Jane","age":20}]' | jq '.[] | select(.age > 25)'
```

### Workflow: Complex Filtering

**Goal:** Advanced data transformation and filtering

**Commands:**
```bash
# Group by field
jq 'group_by(.category)' data.json

# Sort by field
jq 'sort_by(.name)' data.json

# Create new object structure
jq '{user: .name, years: .age}' data.json
```

**Complete Example:**
```bash
# Transform user data into simplified format
echo '[{"id":1,"name":"John","details":{"age":30,"city":"NYC"}}]' | \
  jq '.[] | {name: .name, age: .details.age}'
```

## Command Reference

### Basic Syntax

**Purpose:** Core jq command structure

**Syntax:**
```bash
jq [options] 'filter' [file...]
```

**Common Options:**
| Flag | Description | Example |
|------|-------------|---------|
| `-r` | Raw output (no quotes) | `jq -r '.name'` |
| `-c` | Compact output | `jq -c '.'` |
| `-n` | Don't read input | `jq -n '{}'` |
| `-s` | Read entire input stream | `jq -s '.'` |

### Essential Filters

| Filter | Description | Example |
|--------|-------------|---------|
| `.` | Identity (pretty print) | `jq '.'` |
| `.field` | Extract field | `jq '.name'` |
| `.[]` | Array/object iterator | `jq '.[]'` |
| `select()` | Filter elements | `jq '.[] \| select(.age > 25)'` |
| `map()` | Transform array | `jq 'map(.name)'` |
| `length` | Get length | `jq 'length'` |

## Troubleshooting

### Error: "parse error: Invalid numeric literal"
**Cause:** Malformed JSON input
**Solution:**
1. Validate JSON syntax with a JSON validator
2. Check for trailing commas or missing quotes
3. Use `jq -r '.'` to see raw input

### Error: "jq: command not found"
**Cause:** jq not installed or not in PATH
**Solution:**
1. Install jq using your package manager
2. Verify installation: `which jq`
3. Restart terminal after installation

### Error: "Cannot index string with string"
**Cause:** Trying to access object property on a string value
**Solution:**
1. Check data structure: `jq 'type'`
2. Use conditional access: `jq '.field?'`
3. Debug with: `jq '. | keys'` to see available fields

### Complex Filter Not Working
**Cause:** Incorrect filter syntax or operator precedence
**Solution:**
1. Break down complex filters into steps
2. Use parentheses for grouping: `jq '(.field1 + .field2) | length'`
3. Test each part separately

## Best Practices

- **Start Simple**: Begin with basic filters and build complexity gradually
- **Use Raw Output**: Add `-r` flag when you need unquoted string output
- **Validate JSON First**: Ensure your input is valid JSON before complex filtering
- **Test Incrementally**: Build complex filters step by step
- **Use Compact Mode**: Add `-c` for single-line output when piping to other tools
- **Handle Missing Fields**: Use `?` operator for optional field access (`.field?`)
- **Pretty Print for Debugging**: Use `jq '.'` to format and validate JSON structure

## Additional Resources

- Official Documentation: https://stedolan.github.io/jq/manual/
- jq Playground: https://jqplay.org/
- GitHub Repository: https://github.com/stedolan/jq
- Tutorial: https://stedolan.github.io/jq/tutorial/

---

**CLI Tool:** `jq`
**Installation:** `brew install jq` (macOS) or `sudo apt-get install jq` (Linux)