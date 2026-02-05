# Contributing to Titan

> **Strict Adherence Required**: This repository enforces high-assurance engineering standards. All contributions must pass the SOTA (State-of-the-Art) Quality Gates.

## 1. The Titan Philosophy
We treat the codebase like a Formula 1 car—it must be clean, light, and reliable.
- **Zero Dead Code**: If it's not used, it's deleted.
- **Zero Flakiness**: Flaky tests are bugs.
- **Immutability**: Functional patterns over state mutation.

## 2. Agent Coding Rules (Strict Compliance)

You are an advanced AI engineer. You MUST follow these rules when writing code for this repository.

### Functional Programming & Immutability
- **NEVER** use `let`. Use `const` for everything.
- **NEVER** use mutator methods like `push`, `pop`, `splice`, `shift`, `unshift`, `sort`, `reverse`.
    - BAD: `arr.push(item)`
    - GOOD: `const newArr = [...arr, item]`
- **NEVER** mutate object properties directly.
    - BAD: `obj.prop = value`
    - GOOD: `const newObj = { ...obj, prop: value }`
- **NEVER** use `delete`.
    - BAD: `delete obj.prop`
    - GOOD: `const { prop, ...rest } = obj`
- **Maps/Sets**: Treat them as immutable where possible, or encapsulate strictly.

### Type Safety
- **NEVER** use `any`. Use `unknown` if necessary, or define a type.
- **ALWAYS** define return types for functions.
- **ALWAYS** handle null/undefined explicitly.

### Complexity
- **Modules**: Keep files under 200 lines. Break large logic into sub-modules or strategy patterns.
- **Functions**: Keep functions simple. Cyclomatic complexity should be < 10.
- **No God Classes**: If you touch a >400 LOC file, extract at least one function.

### Architecture
- **Dependency Inspection**: Always check dependencies in `package.json` before importing.
- **Circular Dependencies**: Do not create circular imports. Use interfaces or dependency injection.

## 3. SOTA Toolchain (Quality Gates)

We use a "State-of-the-Art" (SOTA) script suite to enforce quality.

| Command | Purpose | When to Use |
| :--- | :--- | :--- |
| `npm run sota:all` | **Full Verification**. Runs all gates. | **MANDATORY** before PR/Commit. |
| `npm run sota:circular` | **Circular Dependency Guard**. | When adding new imports across service boundaries. |
| `npm run sota:arch` | **Architecture Fitness**. Enforces layer rules. | When creating new modules. |
| `npm run sota:dead` | **Dead Code Scanner**. | When performing cleanup or after major deletions. |
| `npm run sota:zombie` | **Zombie Dependency Scan**. | When updating `package.json` deps. |
| `npm run sota:secrets` | **Secret Scanner**. | **MANDATORY** before creating artifacts/pushing code. |
| `npm run sota:flake` | **Flakiness Detector**. | When a test fails "randomly". |
| `npm run sota:impact` | **Smart Testing**. | To verify your changes quickly. |

## 4. Remediation & QA Protocol

### Zero Behavior Change Rule for Auto-Fixes
Automated tools (`eslint --fix`, `prettier`, etc.) must **only** be used for:
- Formatting (whitespace, indentation).
- Removing definitely unused imports/variables (verified by `tsc`).
- Syntactic sugar that preserves AST semantics.

**FORBIDDEN Auto-Fixes:**
- Changing control flow (loops to map/reduce).
- Modifying logic inside Risk Gates or Order Lifecycle.
- Reordering side-effecting calls.

### Behavioral Diff Requirement
Any Pull Request touching the following areas must include a "Behavioral Diff" section in the description:
- **Risk Gates**: `services/titan-brain/src/risk/**/*.ts`
- **Order Lifecycle**: `services/titan-brain/src/orders/**/*.ts`
- **Reconciliation**: `services/titan-brain/src/recon/**/*.ts`
- **Allocations**: `services/titan-execution-rs/**/*.rs`

### SOTA Release Criteria
A release candidate is accepted ONLY IF:
1. `npm run sota:all` passes (Exit Code 0).
2. No new High/Critical vulnerabilities in `sota:deps` / `sota:audit`.
3. `sota:perf` confirms no regression > 5% in latency.
4. `sota:correctness` passes (Idempotency and Contract checks).

### Emergency Override
If a gate must be bypassed for a hotfix:
1. Open an issue titled `[QA-OVERRIDE] <Reason>`.
2. Commit with trailer `Qa-Override: #issue-id`.
3. Schedule immediate tech-debt task to fix the gate.

## 5. Documentation Style Guide

### Voice & Tone
- **Voice:** Professional, direct, and active. "Configure the bot" instead of "The bot should be configured."
- **Tense:** Present tense. "The system runs..." (not "will run").
- **Audience:** Operators and Engineers. Assume competence but not context.
- **No Fluff:** Avoid "Please", "Simply", "Just".

### Formatting
- **Headings**: Sentence case (`# How to deploy`).
- **Code Blocks**: Always specify language (`bash`, `ts`).
- **Admonitions**: Use GitHub-style alerts (`> [!NOTE]`).
- **Links**: Use relative paths.

