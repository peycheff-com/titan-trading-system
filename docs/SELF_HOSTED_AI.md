# Self-Hosted AI Infrastructure

Deployment scripts and configuration for running Kimi K2.5 on DigitalOcean GPU.

## Quick Start

```bash
# Execute from the repository root:

# Full deployment (requires doctl auth)
./scripts/ops/deploy-gpu.sh all

# Or step-by-step:
./scripts/ops/deploy-gpu.sh provision  # Create L40S droplet
./scripts/ops/deploy-gpu.sh setup      # Install vLLM + nginx
./scripts/ops/deploy-gpu.sh start      # Start inference server
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    DigitalOcean AMS3                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              titan-ai (L40S GPU Droplet)             │   │
│  │                                                       │   │
│  │   ┌─────────┐     ┌─────────────────────────┐       │   │
│  │   │ nginx   │────▶│ vLLM (Kimi K2.5-Instruct)│       │   │
│  │   │ :80     │     │ :8000                    │       │   │
│  │   └─────────┘     └─────────────────────────┘       │   │
│  │        │                    │                        │   │
│  │        │               NVIDIA L40S                   │   │
│  │        │               48GB VRAM                     │   │
│  └────────│─────────────────────────────────────────────┘   │
│           │                                                  │
│           │ VPC Private Network                             │
│           │                                                  │
│  ┌────────▼─────────────────────────────────────────────┐   │
│  │              titan (Main VPS)                         │   │
│  │   KIMI_LOCAL_ENDPOINT=http://titan-ai/v1             │   │
│  └───────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Specifications

| Component | Specification |
|-----------|--------------|
| GPU | NVIDIA L40S (48GB VRAM) |
| Region | AMS3 (Amsterdam) |
| Model | moonshotai/Kimi-K2.5-Instruct |
| Quantization | INT4 |
| Max Context | 131,072 tokens |
| Estimated Cost | ~$500/month |

## Configuration

After deployment, configure Titan:

```bash
# In .env or environment
export KIMI_LOCAL_ENDPOINT=http://<gpu-droplet-ip>/v1
export AI_PROVIDER=kimi-local
```

Or use VPC private IP for lower latency:
```bash
export KIMI_LOCAL_ENDPOINT=http://10.x.x.x/v1
```

## Verification

```bash
# Check status
./scripts/ops/deploy-gpu.sh status

# Test inference
curl -X POST http://<ip>/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"kimi-k2.5-instruct","messages":[{"role":"user","content":"ping"}]}'
```

Expected latency: **<50ms** (vs 200-500ms API)

## Troubleshooting

### vLLM not starting
```bash
ssh root@<ip> journalctl -u vllm -f
```

### Model download stuck
```bash
ssh root@<ip> 'HF_HUB_ENABLE_HF_TRANSFER=1 huggingface-cli download moonshotai/Kimi-K2.5-Instruct'
```

### GPU not detected
```bash
ssh root@<ip> nvidia-smi
```
