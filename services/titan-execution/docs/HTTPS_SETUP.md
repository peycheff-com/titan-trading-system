# HTTPS Setup Guide for Titan Execution Service

This guide explains how to enable HTTPS for the Titan Execution Service to secure all external communication.

## Overview

HTTPS (HTTP Secure) encrypts all data transmitted between clients and the server, protecting sensitive information like API keys, trading signals, and account data from interception.

**Requirements**: 10.7 - Use HTTPS protocol for all external communication in production

## Quick Start (Development)

For local development and testing, you can use self-signed certificates:

```bash
# Generate self-signed certificate
node scripts/generate-ssl-cert.js

# Add to .env
echo "HTTPS_ENABLED=true" >> .env
echo "SSL_KEY_PATH=./certs/titan.key" >> .env
echo "SSL_CERT_PATH=./certs/titan.crt" >> .env

# Start server
npm run start:production
```

## Configuration Options

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `HTTPS_ENABLED` | Enable HTTPS | `false` |
| `SSL_CERT_PATH` | Path to SSL certificate file | - |
| `SSL_KEY_PATH` | Path to SSL private key file | - |
| `HTTPS_PORT` | HTTPS server port | `443` |
| `HTTPS_REDIRECT` | Redirect HTTP to HTTPS | `true` |

## Production Setup with Let's Encrypt

For production, use free certificates from Let's Encrypt:

### 1. Install Certbot

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install certbot

# macOS
brew install certbot

# CentOS/RHEL
sudo yum install certbot
```

### 2. Obtain Certificate

```bash
# Standalone mode (stop Titan first)
sudo certbot certonly --standalone -d your-domain.com

# Or with webroot (if Titan is running)
sudo certbot certonly --webroot -w /var/www/html -d your-domain.com
```

### 3. Configure Titan

Add to your `.env` file:

```bash
HTTPS_ENABLED=true
SSL_CERT_PATH=/etc/letsencrypt/live/your-domain.com/fullchain.pem
SSL_KEY_PATH=/etc/letsencrypt/live/your-domain.com/privkey.pem
HTTPS_PORT=443
HTTPS_REDIRECT=true
```

### 4. Set Up Auto-Renewal

Let's Encrypt certificates expire every 90 days. Set up automatic renewal:

```bash
# Test renewal
sudo certbot renew --dry-run

# Add to crontab (runs twice daily)
echo "0 0,12 * * * root certbot renew --quiet --post-hook 'systemctl restart titan'" | sudo tee /etc/cron.d/certbot-renew
```

## Self-Signed Certificates (Development Only)

For development and testing, use the included script:

```bash
# Generate with defaults
node scripts/generate-ssl-cert.js

# Custom options
node scripts/generate-ssl-cert.js --output ./my-certs --days 365 --cn myhost.local
```

### Trust Self-Signed Certificate

To avoid browser warnings during development:

**macOS:**
```bash
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ./certs/titan.crt
```

**Linux (Ubuntu/Debian):**
```bash
sudo cp ./certs/titan.crt /usr/local/share/ca-certificates/titan.crt
sudo update-ca-certificates
```

**Windows:**
1. Double-click the `.crt` file
2. Click "Install Certificate"
3. Select "Local Machine" → "Trusted Root Certification Authorities"

## HTTP to HTTPS Redirect

When `HTTPS_REDIRECT=true` (default when HTTPS is enabled), the server automatically:

1. Starts an HTTP server on `PORT` (default: 3001)
2. Redirects all HTTP requests to HTTPS with a 301 status code
3. Preserves the original URL path

Example:
- `http://localhost:3001/webhook` → `https://localhost:443/webhook`

## Reverse Proxy Setup (Nginx)

For production, consider using Nginx as a reverse proxy:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    
    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

With Nginx handling SSL, you can disable HTTPS in Titan:

```bash
HTTPS_ENABLED=false
PORT=3001
```

## Troubleshooting

### Certificate Not Found

```
❌ Failed to load SSL certificates: ENOENT: no such file or directory
```

**Solution**: Verify the paths in `SSL_CERT_PATH` and `SSL_KEY_PATH` are correct and the files exist.

### Permission Denied

```
❌ Failed to load SSL certificates: EACCES: permission denied
```

**Solution**: Ensure the Titan process has read access to the certificate files:

```bash
sudo chmod 644 /path/to/cert.crt
sudo chmod 600 /path/to/key.key
sudo chown titan:titan /path/to/key.key
```

### Port 443 Already in Use

```
Error: listen EADDRINUSE: address already in use :::443
```

**Solution**: Either stop the conflicting service or use a different port:

```bash
HTTPS_PORT=8443
```

### Browser Shows "Not Secure"

This happens with self-signed certificates. For production, use Let's Encrypt. For development, trust the certificate (see above).

## Security Best Practices

1. **Use Strong Certificates**: RSA 4096-bit or ECDSA P-384
2. **Enable HSTS**: Add `Strict-Transport-Security` header
3. **Disable Old Protocols**: Only allow TLS 1.2 and 1.3
4. **Regular Renewal**: Automate certificate renewal
5. **Protect Private Keys**: Restrict file permissions (600)
6. **Monitor Expiration**: Set up alerts for certificate expiry

## Testing HTTPS

```bash
# Test with curl
curl -v https://localhost:443/health

# Test with self-signed cert (skip verification)
curl -k https://localhost:443/health

# Check certificate details
openssl s_client -connect localhost:443 -showcerts

# Verify certificate chain
openssl verify -CAfile /path/to/ca.crt /path/to/titan.crt
```

## Related Documentation

- [Deployment Guide](./deployment.md)
- [Credential Encryption](./CREDENTIAL_ENCRYPTION.md)
- [Monitoring Setup](./MONITORING_SETUP.md)
