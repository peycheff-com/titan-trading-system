# AI Agent Instructions

**READ THIS FIRST.**

If you are an AI agent or autonomous coding assistant, this document is your **Operating System**. It defines how you should navigate, modify, and verify the Titan Trading System.

## 1. Navigation Protocol

- **Global Map**: Always check `docs/knowledge-graph.md` first to locate files.
- **Source of Truth**: `docs/system-source-of-truth.md` overrides ALL other documents. If code conflicts with it, the code is likely wrong (or the doc needs updating).
- **Service Context**: Every service has a `README.md` in its root (e.g., `services/titan-brain/README.md`). Use these only to find the canonical docs link.

## 2. Coding Standards (The "SOTA" Standard)

> "Dull is good. Boring is reliable."

- **Strict Types**: No `any`. No `// @ts-ignore` without an essay-length justification.
- **Fail-Closed**: If a secret is missing, crash. If a signature is invalid, reject. Never fallback to "insecure mode".
- **Evidence-Based**: Never change code based on a guess. grep first. `npm test` after.
- **Canonical Deps**: Use `npm install` at the root. Do not manually edit `package.json` versions unless necessary.

## 3. Invariants (Do Not Break)

1. **Risk Policy**: `packages/shared/risk_policy.json` must be identical to `services/titan-execution-rs/src/risk_policy.json`.
2. **Immutability**: Do not modify `metrics/` manually.
3. **Ports**: See `docs/system-source-of-truth.md` for the canonical port map.

## 4. Verification Workflow

Before reporting a task as "Done":

1. **Lint**: `npm run lint:fix`
2. **Test**: `npm test` (or specific service test)
3. **Build**: `npm run build` (if structural changes)
4. **Docs**: `npm run lint:docs` (if you touched .md files)

## 5. Emergency Contacts

- **Logs**: `pm2 logs`
- **Config Check**: `npm run validate:config`
- **SOTA Check**: `npm run sota:all`
