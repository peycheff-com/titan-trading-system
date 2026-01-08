---
name: "curl-cli-guide"
displayName: "cURL CLI Guide"
description: "Complete guide for using cURL command-line tool for HTTP requests, file transfers, and API testing with examples and troubleshooting."
keywords: ["curl", "http", "api", "cli", "requests", "download", "upload"]
author: "Kiro Assistant"
---

# cURL CLI Guide

## Overview

cURL is a powerful command-line tool for transferring data with URLs. It supports numerous protocols including HTTP, HTTPS, FTP, and more. This guide covers installation, common usage patterns, and troubleshooting for everyday HTTP requests and API interactions.

Whether you're testing APIs, downloading files, or debugging web services, cURL provides a reliable and flexible solution for data transfer operations from the command line.

## Onboarding

### Installation

#### macOS (via Homebrew)
```bash
brew install curl
```

#### Ubuntu/Debian
```bash
sudo apt-get update
sudo apt-get install curl
```

#### Windows
```bash
# Via Chocolatey
choco install curl

# Via Scoop
scoop install curl
```

### Prerequisites
- No special prerequisites - cURL works on all major operating systems
- For HTTPS requests: SSL/TLS support (included in modern installations)

### Verification
```bash
# Check if cURL is installed
curl --version

# Expected output:
curl 7.68.0 (x86_64-pc-linux-gnu) libcurl/7.68.0
```

## Common Workflows

### Workflow: Basic HTTP Requests

**Goal:** Make simple GET, POST, PUT, DELETE requests

**GET Request:**
```bash
# Simple GET request
curl https://api.example.com/users

# GET with headers
curl -H "Authorization: Bearer token123" https://api.example.com/users

# GET and save response to file
curl -o response.json https://api.example.com/users
```

**POST Request:**
```bash
# POST with JSON data
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"name":"John","email":"john@example.com"}' \
  https://api.example.com/users

# POST with form data
curl -X POST \
  -d "name=John&email=john@example.com" \
  https://api.example.com/users
```

### Workflow: File Operations

**Goal:** Download and upload files

**Download Files:**
```bash
# Download file
curl -O https://example.com/file.zip

# Download with custom filename
curl -o myfile.zip https://example.com/file.zip

# Resume interrupted download
curl -C - -O https://example.com/largefile.zip
```

**Upload Files:**
```bash
# Upload file via POST
curl -X POST \
  -F "file=@document.pdf" \
  https://api.example.com/upload

# Upload with additional form fields
curl -X POST \
  -F "file=@document.pdf" \
  -F "description=Important document" \
  https://api.example.com/upload
```

### Workflow: API Testing

**Goal:** Test REST APIs with authentication and debugging

**Complete Example:**
```bash
# Test API endpoint with full debugging
curl -X GET \
  -H "Authorization: Bearer your-token-here" \
  -H "Accept: application/json" \
  -v \
  https://api.example.com/users/123

# Test POST with JSON and see response headers
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token-here" \
  -d '{"status":"active"}' \
  -i \
  https://api.example.com/users/123
```

## Command Reference

### Basic Options

| Flag | Description | Example |
|------|-------------|---------|
| `-X` | HTTP method | `-X POST` |
| `-H` | Add header | `-H "Content-Type: application/json"` |
| `-d` | Send data | `-d '{"key":"value"}'` |
| `-o` | Output to file | `-o response.json` |
| `-O` | Save with remote filename | `-O` |
| `-v` | Verbose output | `-v` |
| `-i` | Include response headers | `-i` |
| `-s` | Silent mode | `-s` |
| `-f` | Fail silently on HTTP errors | `-f` |

### Authentication Options

| Flag | Description | Example |
|------|-------------|---------|
| `-u` | Basic auth | `-u username:password` |
| `-H` | Bearer token | `-H "Authorization: Bearer token"` |
| `-E` | Client certificate | `-E cert.pem` |
| `--oauth2-bearer` | OAuth2 token | `--oauth2-bearer token123` |

### Advanced Options

| Flag | Description | Example |
|------|-------------|---------|
| `-L` | Follow redirects | `-L` |
| `-k` | Ignore SSL errors | `-k` |
| `-m` | Maximum time | `-m 30` |
| `-w` | Write format | `-w "%{http_code}"` |
| `--retry` | Retry attempts | `--retry 3` |
| `-C` | Resume transfer | `-C -` |

## Troubleshooting

### Error: "curl: command not found"
**Cause:** cURL is not installed or not in PATH
**Solution:**
1. Install cURL using your package manager (see Installation section)
2. Verify installation: `which curl`
3. Restart terminal after installation

### Error: "SSL certificate problem"
**Cause:** SSL certificate verification failed
**Solution:**
1. **Recommended:** Fix the certificate issue on the server
2. **For testing only:** Use `-k` flag to ignore SSL errors
   ```bash
   curl -k https://example.com
   ```
3. Update CA certificates:
   ```bash
   # Ubuntu/Debian
   sudo apt-get update && sudo apt-get install ca-certificates
   
   # macOS
   brew update && brew upgrade curl
   ```

### Error: "Connection refused" or "Connection timeout"
**Cause:** Server is not reachable or wrong URL
**Solution:**
1. Verify the URL is correct
2. Check if server is running: `ping example.com`
3. Try with verbose output: `curl -v https://example.com`
4. Check firewall settings
5. Use `-m` flag to set timeout: `curl -m 30 https://example.com`

### Error: "HTTP 401 Unauthorized"
**Cause:** Missing or invalid authentication
**Solution:**
1. Verify API key/token is correct
2. Check authentication method:
   ```bash
   # Basic auth
   curl -u username:password https://api.example.com
   
   # Bearer token
   curl -H "Authorization: Bearer your-token" https://api.example.com
   ```
3. Ensure token hasn't expired

### Error: "HTTP 400 Bad Request"
**Cause:** Invalid request format or missing required fields
**Solution:**
1. Check Content-Type header matches data format
2. Validate JSON syntax: `echo '{"key":"value"}' | jq .`
3. Review API documentation for required fields
4. Use `-v` flag to see full request details

## Best Practices

- **Use verbose mode (`-v`) for debugging** - Shows full request/response details
- **Set timeouts (`-m 30`)** - Prevent hanging requests
- **Follow redirects (`-L`)** - Handle 301/302 responses automatically
- **Save responses to files (`-o`)** - For large responses or further processing
- **Use proper Content-Type headers** - Match header to data format
- **Handle errors gracefully (`-f`)** - Exit with error code on HTTP errors
- **Use environment variables for secrets** - Don't put tokens in command history
- **Quote JSON data properly** - Use single quotes around JSON strings
- **Test with small requests first** - Verify authentication and endpoints work

## Additional Resources

- Official Documentation: https://curl.se/docs/
- Manual Page: `man curl`
- HTTP Status Codes: https://httpstatuses.com/
- JSON Validator: https://jsonlint.com/

---

**CLI Tool:** `curl`
**Installation:** `brew install curl` (macOS) or `apt-get install curl` (Linux)