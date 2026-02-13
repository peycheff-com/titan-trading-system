#!/bin/bash
set -euo pipefail
# =============================================================================
# Titan AI GPU Droplet Provisioning Script
# Deploy self-hosted Kimi K2.5 inference on DigitalOcean L40S GPU
# =============================================================================
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}🤖 Titan AI - GPU Infrastructure Provisioning${NC}"
echo ""

# Prerequisites check
check_prerequisites() {
    if ! command -v doctl &> /dev/null; then
        echo -e "${RED}Error: doctl (DigitalOcean CLI) is not installed.${NC}"
        echo "Install: brew install doctl && doctl auth init"
        exit 1
    fi

    if ! doctl auth list &> /dev/null; then
        echo -e "${RED}Error: doctl is not authenticated.${NC}"
        echo "Run: doctl auth init"
        exit 1
    fi
    echo -e "${GREEN}✅ Prerequisites verified${NC}"
}

# Configuration
GPU_DROPLET_NAME="titan-ai"
GPU_REGION="ams3"  # Co-located with existing Titan infrastructure
GPU_SIZE="gpu-l40s-48gb"  # L40S with 48GB VRAM
GPU_IMAGE="nvidia-ubuntu-22-04"

# Get or set VPC ID
get_vpc() {
    # Check if TITAN_VPC_ID is set
    if [ -n "$TITAN_VPC_ID" ]; then
        echo "$TITAN_VPC_ID"
        return
    fi

    # Try to find existing VPC in ams3
    VPC_ID=$(doctl vpcs list --format ID,Name,Region --no-header | grep ams3 | head -1 | awk '{print $1}')
    if [ -n "$VPC_ID" ]; then
        echo "$VPC_ID"
        return
    fi

    echo ""
}

# SSH Key setup
get_ssh_keys() {
    # Get all SSH keys
    doctl compute ssh-key list --format ID --no-header | tr '\n' ','  | sed 's/,$//'
}

provision_gpu_droplet() {
    echo -e "${YELLOW}🔧 Provisioning GPU Droplet...${NC}"
    
    VPC_ID=$(get_vpc)
    SSH_KEYS=$(get_ssh_keys)
    
    if [ -z "$SSH_KEYS" ]; then
        echo -e "${RED}Error: No SSH keys found. Add an SSH key first.${NC}"
        echo "Run: doctl compute ssh-key create titan --public-key-file ~/.ssh/id_rsa.pub"
        exit 1
    fi

    # Check if droplet already exists
    EXISTING=$(doctl compute droplet list --format Name --no-header | grep "^${GPU_DROPLET_NAME}$" || true)
    if [ -n "$EXISTING" ]; then
        echo -e "${YELLOW}⚠️  Droplet '${GPU_DROPLET_NAME}' already exists.${NC}"
        echo "To recreate: doctl compute droplet delete ${GPU_DROPLET_NAME} --force"
        return 0
    fi

    # Build command
    CMD="doctl compute droplet create ${GPU_DROPLET_NAME}"
    CMD+=" --region ${GPU_REGION}"
    CMD+=" --size ${GPU_SIZE}"
    CMD+=" --image ${GPU_IMAGE}"
    CMD+=" --ssh-keys ${SSH_KEYS}"
    CMD+=" --enable-private-networking"
    CMD+=" --wait"
    
    if [ -n "$VPC_ID" ]; then
        CMD+=" --vpc-uuid ${VPC_ID}"
    fi

    echo -e "${CYAN}Command: ${CMD}${NC}"
    eval "$CMD"
    
    echo -e "${GREEN}✅ GPU Droplet provisioned${NC}"
}

get_droplet_ip() {
    doctl compute droplet get "${GPU_DROPLET_NAME}" --format PublicIPv4 --no-header 2>/dev/null || echo ""
}

setup_vllm() {
    IP=$(get_droplet_ip)
    if [ -z "$IP" ]; then
        echo -e "${RED}Error: Could not get droplet IP${NC}"
        exit 1
    fi

    echo -e "${YELLOW}📦 Installing vLLM on ${IP}...${NC}"
    
    # Copy setup script to droplet
    ssh -o StrictHostKeyChecking=no root@"$IP" 'bash -s' << 'REMOTE_SCRIPT'
        set -e
        
        echo "📦 Installing dependencies..."
        apt-get update
        apt-get install -y python3-pip python3-venv nginx certbot python3-certbot-nginx
        
        echo "🐍 Setting up Python environment..."
        python3 -m venv /opt/vllm-env
        source /opt/vllm-env/bin/activate
        
        echo "🚀 Installing vLLM..."
        pip install vllm
        
        echo "📝 Creating systemd service..."
        cat > /etc/systemd/system/vllm.service << 'SERVICE'
[Unit]
Description=vLLM Kimi K2.5 Inference Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt
ExecStart=/opt/vllm-env/bin/vllm serve moonshotai/Kimi-K2.5-Instruct \
    --tensor-parallel-size 1 \
    --quantization int4 \
    --max-model-len 131072 \
    --port 8000 \
    --host 127.0.0.1
Restart=always
RestartSec=10
Environment="CUDA_VISIBLE_DEVICES=0"

[Install]
WantedBy=multi-user.target
SERVICE

        systemctl daemon-reload
        
        echo "✅ vLLM setup complete. Start with: systemctl start vllm"
REMOTE_SCRIPT

    echo -e "${GREEN}✅ vLLM installed on GPU droplet${NC}"
}

setup_nginx() {
    IP=$(get_droplet_ip)
    if [ -z "$IP" ]; then
        echo -e "${RED}Error: Could not get droplet IP${NC}"
        exit 1
    fi

    echo -e "${YELLOW}🔐 Configuring nginx reverse proxy...${NC}"
    
    ssh -o StrictHostKeyChecking=no root@"$IP" 'bash -s' << 'REMOTE_SCRIPT'
        cat > /etc/nginx/sites-available/vllm << 'NGINX'
server {
    listen 80;
    server_name _;

    location /v1/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_http_version 1.1;
        proxy_read_timeout 120s;
    }
    
    location /health {
        proxy_pass http://127.0.0.1:8000/health;
    }
}
NGINX

        ln -sf /etc/nginx/sites-available/vllm /etc/nginx/sites-enabled/
        rm -f /etc/nginx/sites-enabled/default
        nginx -t && systemctl reload nginx
        
        echo "✅ Nginx configured"
REMOTE_SCRIPT

    echo -e "${GREEN}✅ Nginx reverse proxy configured${NC}"
}

start_services() {
    IP=$(get_droplet_ip)
    echo -e "${YELLOW}🚀 Starting vLLM service...${NC}"
    
    ssh -o StrictHostKeyChecking=no root@"$IP" 'systemctl enable vllm && systemctl start vllm'
    
    echo -e "${GREEN}✅ Services started${NC}"
    echo ""
    echo -e "${CYAN}🎯 Endpoint Ready:${NC}"
    echo -e "   http://${IP}/v1/chat/completions"
    echo ""
    echo -e "${YELLOW}To configure Titan:${NC}"
    echo "   export KIMI_LOCAL_ENDPOINT=http://${IP}/v1"
    echo "   export AI_PROVIDER=kimi-local"
}

status() {
    IP=$(get_droplet_ip)
    if [ -z "$IP" ]; then
        echo -e "${RED}No GPU droplet found${NC}"
        exit 1
    fi

    echo -e "${CYAN}GPU Droplet Status:${NC}"
    doctl compute droplet get "${GPU_DROPLET_NAME}" --format ID,Name,PublicIPv4,Status,Memory,VCPUs
    
    echo ""
    ssh -o StrictHostKeyChecking=no root@"$IP" 'systemctl status vllm --no-pager || echo "vLLM not running"'
}

# Main
case "${1:-}" in
    provision)
        check_prerequisites
        provision_gpu_droplet
        ;;
    setup)
        setup_vllm
        setup_nginx
        ;;
    start)
        start_services
        ;;
    all)
        check_prerequisites
        provision_gpu_droplet
        setup_vllm
        setup_nginx
        start_services
        ;;
    status)
        status
        ;;
    ip)
        get_droplet_ip
        ;;
    *)
        echo "Usage: $0 {provision|setup|start|all|status|ip}"
        echo ""
        echo "  provision - Create GPU droplet on DigitalOcean"
        echo "  setup     - Install vLLM and configure nginx"
        echo "  start     - Start vLLM service"
        echo "  all       - Full deployment (provision + setup + start)"
        echo "  status    - Check droplet and service status"
        echo "  ip        - Get droplet public IP"
        exit 1
        ;;
esac
