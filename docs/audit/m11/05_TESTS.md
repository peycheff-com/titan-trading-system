# Tests: M11 (Titan Console)

## Test Stack
- **Runner**: Vitest
- **Environment**: jsdom
- **Utilities**: `@testing-library/react`, `@testing-library/jest-dom`

## Test Categories
| Category | Exists? | Command | Config |
|----------|---------|---------|--------|
| **Unit/Component** | ✅ | `npm run test` | `vitest.config.ts` |
| **E2E** | ❌ | — | — |
| **Visual Regression** | ❌ | — | — |

## Global Setup
- Polyfills: `ResizeObserver`, `PointerEvent`, `scrollIntoView` (in `src/test/setup.ts`)

## Coverage Targets
- **Statements**: > 80% (Current: Unknown)
- **Branches**: > 70% (Current: Unknown)
- **Functions**: > 80% (Current: Unknown)
