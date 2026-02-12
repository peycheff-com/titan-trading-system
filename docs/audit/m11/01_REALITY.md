# Reality Snapshot: M11 (Titan Console)

## Build Status
- [ ] Compiles cleanly (Failed: `lint` failed with 138 problems)
- [x] Lint passes (Failed: 4 errors, 134 warnings)
- [ ] Tests pass (Not yet run)

## Doc-to-Code Alignment
| Claim (from docs) | Code Reality | Gap? |
|--------------------|-------------|------|
| "Titan Console" | `apps/titan-console` | ✅ |
| "React / Vite" | `package.json` confirms Vite + React | ✅ |
| "Port 3001" | `vite.config.ts` confirms port 3001 | ✅ |

## Project Structure
- `src/App.tsx`: Main application entry point
- `src/components/`: Reusable UI components
- `src/config/`: Configuration files
- `src/context/`: React Context providers
- `src/hooks/`: Custom React hooks
- `src/lib/`: Utility functions and libraries
- `src/modules/`: Feature-specific modules
- `src/pages/`: Page components (Routing targets)
- `src/test/`: Test setup and utilities
- `src/types/`: TypeScript type definitions

## Key Patterns
- **State Management**: React Query (`@tanstack/react-query`) for server state.
- **Styling**: TailwindCSS with `clsx` and `tailwind-merge`.
- **UI Components**: Radix UI primitives.
- **Routing**: `react-router-dom`.
- **API Interaction**: Proxied via Vite to backend (`/api` -> `http://localhost:3000` or `titan-console-api`).

## Current Issues
- **Linting**: High number of lint warnings (138), primarily `no-explicit-any`.
- **Types**: Widespread use of `any` needs remediation.
