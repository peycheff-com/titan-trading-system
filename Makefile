# Titan Trading System - Makefile

.PHONY: ci docker-build docker-push deploy-prod simulation simulation-verify

# Variables
TITAN_REGISTRY ?= ghcr.io/peycheff-com/titan-trading-system
IMAGE_TAG ?= $(shell git rev-parse HEAD)

ci:
	npm run validate:config
	npm run sota:zombie
	./scripts/ci/check_contracts.sh
	# Add other CI steps here

docker-build:
	docker build -t $(TITAN_REGISTRY)/titan-brain:$(IMAGE_TAG) -f services/titan-brain/Dockerfile .
	docker build -t $(TITAN_REGISTRY)/titan-execution-rs:$(IMAGE_TAG) -f services/titan-execution-rs/Dockerfile services/titan-execution-rs
	docker build -t $(TITAN_REGISTRY)/titan-console:$(IMAGE_TAG) -f services/titan-console/Dockerfile .
	docker build -t $(TITAN_REGISTRY)/titan-phase1-scavenger:$(IMAGE_TAG) -f services/titan-phase1-scavenger/Dockerfile .
	docker build -t $(TITAN_REGISTRY)/titan-phase2-hunter:$(IMAGE_TAG) -f services/titan-phase2-hunter/Dockerfile .
	docker build -t $(TITAN_REGISTRY)/titan-phase3-sentinel:$(IMAGE_TAG) -f services/titan-phase3-sentinel/Dockerfile .
	docker build -t $(TITAN_REGISTRY)/titan-ai-quant:$(IMAGE_TAG) -f services/titan-ai-quant/Dockerfile .
	docker build -t $(TITAN_REGISTRY)/titan-powerlaw-lab:$(IMAGE_TAG) -f services/titan-powerlaw-lab/Dockerfile .

docker-push:
	docker push $(TITAN_REGISTRY)/titan-brain:$(IMAGE_TAG)
	docker push $(TITAN_REGISTRY)/titan-execution-rs:$(IMAGE_TAG)
	docker push $(TITAN_REGISTRY)/titan-console:$(IMAGE_TAG)
	docker push $(TITAN_REGISTRY)/titan-phase1-scavenger:$(IMAGE_TAG)
	docker push $(TITAN_REGISTRY)/titan-phase2-hunter:$(IMAGE_TAG)
	docker push $(TITAN_REGISTRY)/titan-phase3-sentinel:$(IMAGE_TAG)
	docker push $(TITAN_REGISTRY)/titan-ai-quant:$(IMAGE_TAG)
	docker push $(TITAN_REGISTRY)/titan-powerlaw-lab:$(IMAGE_TAG)

# Simulation: Runs the deployment script locally (requires verifying env vars)
simulation:
	@echo "Simulating deployment..."
	@echo "IMAGE_TAG=$(IMAGE_TAG)" > scripts/ci/.env.deploy.sim
	@echo "TITAN_REGISTRY=$(TITAN_REGISTRY)" >> scripts/ci/.env.deploy.sim
	@# Mock the droplet paths by setting TITAN_ROOT to current dir/simulation
	mkdir -p simulation/compose simulation/scripts simulation/logs simulation/state
	cp docker-compose.prod.yml simulation/compose/
	cp .env.prod simulation/compose/ 2>/dev/null || echo "WARNING: No .env.prod found, using empty" > simulation/compose/.env.prod
	cp scripts/ci/.env.deploy.sim simulation/compose/.env.deploy
	cp scripts/ci/*.sh simulation/scripts/
	chmod +x simulation/scripts/*.sh
	@echo "Ready to run:"
	@echo "  TITAN_ROOT=$$(pwd)/simulation ./simulation/scripts/deploy.sh"
	@# We don't verify execution here to avoid side effects on dev machine unless requested

simulation-verify:
	@echo "Verifying simulation artifacts..."
	ls -F simulation/scripts/
	ls -F simulation/compose/
	@echo "Verify script content:"
	head -n 20 simulation/scripts/verify.sh
