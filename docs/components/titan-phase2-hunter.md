# Titan Hunter (Phase 2)

**Context**: Strategy Service (TypeScript)
**Port**: 8083
**Role**: Momentum & Trend Following (Growth Engine).

## Key Files

- `src/index.ts`: Entry point.

## Dependencies

- **Output**: Emits `titan.evt.hunter.signal.v1` to Brain.
- **Input**: Listens to `titan.evt.market.*` (Market Data).