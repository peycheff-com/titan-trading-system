# Titan Trading System - Makefile

.PHONY: ci docker-build docker-push deploy-prod-sim check-env

# Variables - Check for buildx
BUILDX_CHECK := $(shell docker buildx inspect >/dev/null 2>&1 && echo "yes" || echo "no")
# Default repository
TITAN_REGISTRY ?= ghcr.io/peycheff-com/titan-trading-system
SHA ?= $(shell git rev-parse HEAD)

ci:
	# CI Pipeline Simulation (Lint, Test, Check Contracts)
	@echo "Running local CI pipeline..."
	npm run validate:config
	npm run sota:zombie
	# ./scripts/ci/check_contracts.sh # If this exists, uncomment

docker-build:
	@echo "Building all images for SHA $(SHA)..."
	docker build -t $(TITAN_REGISTRY)/titan-brain:$(SHA) -f services/titan-brain/Dockerfile .
	docker build -t $(TITAN_REGISTRY)/titan-execution-rs:$(SHA) -f services/titan-execution-rs/Dockerfile services/titan-execution-rs
	docker build -t $(TITAN_REGISTRY)/titan-console:$(SHA) -f apps/titan-console/Dockerfile .
	docker build -t $(TITAN_REGISTRY)/titan-phase1-scavenger:$(SHA) -f services/titan-phase1-scavenger/Dockerfile .
	docker build -t $(TITAN_REGISTRY)/titan-phase2-hunter:$(SHA) -f services/titan-phase2-hunter/Dockerfile .
	docker build -t $(TITAN_REGISTRY)/titan-phase3-sentinel:$(SHA) -f services/titan-phase3-sentinel/Dockerfile .
	docker build -t $(TITAN_REGISTRY)/titan-ai-quant:$(SHA) -f services/titan-ai-quant/Dockerfile .
	docker build -t $(TITAN_REGISTRY)/titan-powerlaw-lab:$(SHA) -f services/titan-powerlaw-lab/Dockerfile .

docker-push:
	@echo "Pushing images for SHA $(SHA)..."
	docker push $(TITAN_REGISTRY)/titan-brain:$(SHA)
	docker push $(TITAN_REGISTRY)/titan-execution-rs:$(SHA)
	docker push $(TITAN_REGISTRY)/titan-console:$(SHA)
	docker push $(TITAN_REGISTRY)/titan-phase1-scavenger:$(SHA)
	docker push $(TITAN_REGISTRY)/titan-phase2-hunter:$(SHA)
	docker push $(TITAN_REGISTRY)/titan-phase3-sentinel:$(SHA)
	docker push $(TITAN_REGISTRY)/titan-ai-quant:$(SHA)
	docker push $(TITAN_REGISTRY)/titan-powerlaw-lab:$(SHA)

deploy-prod-sim:
	@echo "Running Production Simulation..."
	@echo "Setting up mock environment in ./simulation"
	
	mkdir -p simulation/titan/state
	mkdir -p simulation/titan/compose
	mkdir -p simulation/titan/logs
	mkdir -p simulation/titan/tmp_deploy_$(SHA)/scripts
	mkdir -p simulation/titan/tmp_deploy_$(SHA)/compose
	mkdir -p simulation/titan/tmp_deploy_$(SHA)/evidence
	
	# Mock Secrets
	echo "TITAN_DB_PASSWORD=mock" > simulation/titan/compose/.env.prod
	echo "NATS_SYS_PASSWORD=mock" >> simulation/titan/compose/.env.prod
	echo "NATS_BRAIN_PASSWORD=mock" >> simulation/titan/compose/.env.prod
	echo "NATS_EXECUTION_PASSWORD=mock" >> simulation/titan/compose/.env.prod
	
	# Mock Artifacts
	cp scripts/ci/*.sh simulation/titan/tmp_deploy_$(SHA)/scripts/
	cp scripts/ci/*.py simulation/titan/tmp_deploy_$(SHA)/scripts/
	chmod +x simulation/titan/tmp_deploy_$(SHA)/scripts/*.sh
	cp docker-compose.prod.yml simulation/titan/tmp_deploy_$(SHA)/compose/
	
	# Mock Digests (Self-referential just for testing script logic works)
	echo "{" > simulation/titan/tmp_deploy_$(SHA)/evidence/digests.json
	echo "\"titan-brain\": \"$(TITAN_REGISTRY)/titan-brain:$(SHA)\"," >> simulation/titan/tmp_deploy_$(SHA)/evidence/digests.json
	echo "\"titan-execution-rs\": \"$(TITAN_REGISTRY)/titan-execution-rs:$(SHA)\"" >> simulation/titan/tmp_deploy_$(SHA)/evidence/digests.json
	echo "}" >> simulation/titan/tmp_deploy_$(SHA)/evidence/digests.json
	
	# Mock binaries
	mkdir -p simulation/bin
	echo '#!/bin/sh' > simulation/bin/docker && echo 'echo "[MOCK DOCKER] $$*"' >> simulation/bin/docker && chmod +x simulation/bin/docker
	echo '#!/bin/sh' > simulation/bin/flock && echo 'echo "[MOCK FLOCK] $$*"' >> simulation/bin/flock && chmod +x simulation/bin/flock
	
	@echo "Executing deploy.sh with TITAN_ROOT=$(PWD)/simulation/titan"
	
	export TITAN_ROOT=$(PWD)/simulation/titan; \
	export TITAN_SIMULATION=true; \
	export PATH=$(PWD)/simulation/bin:$$PATH; \
	$(PWD)/simulation/titan/tmp_deploy_$(SHA)/scripts/deploy.sh $(SHA) || echo "Simulation Failed"

