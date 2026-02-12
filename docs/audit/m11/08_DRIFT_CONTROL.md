# Drift Control: M11 (Titan Console)

## Code Quality Gates
- **Linting**: `eslint` with `@typescript-eslint` and `react-hooks`
- **Type Checking**: `tsc --noEmit`
- **Formatting**: `prettier` (implied by `.prettierrc`)

## Version Pinning
- **Node**: `>=20.0.0`
- **React**: `^18.3.1`
- **Vite**: `^6.0.7`

## CI/CD
- **Build**: `npm run build` must pass
- **Lint**: `npm run lint` must pass (Currently failing)
- **Test**: `npm run test` must pass
