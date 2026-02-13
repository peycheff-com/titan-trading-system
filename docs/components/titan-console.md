# Titan Console

**Context**: Frontend Application (React/Vite)
**Port**: 3001
**Role**: Operator Interface, Monitoring, Manual Control.

## Key Files

- `src/App.tsx`: Main application shell.
- `src/components/`: Reusable UI components.
- `src/components/settings/ConfigItemRenderer.tsx`: Generic renderer for config items (slider, input, toggle, select, secret widgets).
- `src/hooks/useConfig.ts`: Config management hooks — catalog, effective values, overrides, presets.
- `src/pages/`: Route pages (Dashboard, Settings, etc.).

## Settings Page

The **Settings** page (`src/pages/Settings.tsx`) provides the operator interface for runtime configuration:

- **Dynamic rendering**: Config items are fetched from `GET /config/catalog` and rendered based on their `widget` type.
- **Provenance badges**: Each value shows its source — `default`, `env`, or `override`.
- **Save with reason**: Overrides are applied via `POST /config/override` with a required audit reason.
- **Rollback**: Active overrides can be rolled back to the previous value with one click.
- **Preset profiles**: Quick-apply buttons for Conservative, Balanced, and Aggressive risk profiles.
- **Categories**: Items are grouped across Trading, Safety, and Execution tabs.

## Dependencies

- **API**: Connects to `titan-brain` (REST/WS) and `titan-execution` (WS).
- **Styling**: Uses Tailwind CSS & Radix UI.

