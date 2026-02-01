# ADR: Quarantined Memory Organ + Console Generative UI

## Status
Proposed

## Context
Titan needs to augment its operator effectiveness and research capabilities with institutional memory (Cognee) and context-aware interfaces (Generative UI). However, Titan's core principles of determinism, verifiable risk safety, and "execution as truth" cannot be compromised. The new systems must be useful but strictly quarantined from the execution critical path.

## Decision
We will implement two new "organs" as optional, sidecar extensions:

### 1. Titan Memory Service (Cognee-based)
- **Architecture**: A standalone Node.js/Python service (`titan-memory`) running Cognee.
- **Role**: Ingests runbooks, post-mortems, and non-sensitive logs to provide a semantic search and question-answering graphs.
- **Quarantine**: 
    - No write access to any production database (Postgres/Redis) used by Brain or Execution.
    - Read-only access to specific, sanitized log streams or documents.
    - No direct network path to `titan-execution-rs`.
- **Data Classification**:
    - **PUBLIC**: External docs.
    - **INTERNAL**: Runbooks, non-sensitive logs.
    - **SECRET**: API keys, PII, strategy secrets (Strictly DENIED).

### 2. Console Generative UI (CopilotKit-based)
- **Architecture**: Integrated into `titan-console` (React/Vite) using CopilotKit.
- **Role**: Renders context-specific UI components (e.g., "Show me the drift incident from last Tuesday") to assist operators.
- **Quarantine**:
    - **Render-Only/Draft-Only**: The agent can only render UI components or pre-fill "Action Drafts".
    - **Human-in-the-loop**: All privileged actions (ARM, FLATTEN) require the standard "Armed + Double-Confirm" flow. The AI cannot bypass this.
    - **Component Whitelist**: The AI can only instantiate components from a strict registry.

## Trust Boundaries
1. **Memory -> Operator**: Advisory only. "The memory organ suggests X".
2. **GenUI -> Console**: Display only. "Here is a dashboard view of X".
3. **Console -> Brain**: Existing API contracts. The AI generates the *payload* for the API call, but the *user* clicks the button.

## interfaces
- **Memory Service**: 
    - `POST /ingest` (Admin only)
    - `POST /search` (Internal users)
    - `GET /health`
- **GenUI Protocol**:
    - `useCopilotChat` hook in Console.
    - Custom tool definitions that map to `titan-memory` search or local state visualization.

## Failure Modes & Default-Safe Behavior
- **Memory Service Down**: Console shows "Memory Offline" badge. Search returns empty. Trading continues unaffected.
- **GenUI Hallucination**: If AI suggests non-existent component or invalid props, strict schema validation catches it and renders an "Error Card".
- **Prompt Injection**: Any attempt to inject commands is blocked by the backend's rigorous `OperatorAction` schema validation and the human confirmation step.

## Metrics
- `memory_ingest_count`, `memory_search_latency`
- `ui_gen_requests`, `ui_validation_failures`
- `operator_draft_adoption_rate` (how often AI suggestions are used)

## Rollout
- Feature Flags: `VITE_ENABLE_MEMORY`, `VITE_ENABLE_COPILOT`.
- Profile: `docker-compose --profile optional up -d`.
