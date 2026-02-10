# Titan Scavenger (Phase 1)

**Context**: Strategy Service (TypeScript/React-based)
**Port**: 8081
**Role**: Predestination Trap System (Account Builder).

## Key Files

- `src/index.tsx`: Entry point.
- `src/App.tsx`: Main logic loop.

## Dependencies

- **Output**: Emits `titan.evt.scavenger.signal.v1` to Brain.
- **Input**: Listens to `titan.evt.market.*` (Market Data).
