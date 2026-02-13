# Configuration Governance

## Source of Truth

- `ConfigRegistry.ts` (`services/titan-brain/src/services/config/ConfigRegistry.ts`) is the authoritative runtime configuration source.
- The `CONFIG_CATALOG` array defines all tunable parameters with safety constraints, schemas, and defaults.
- Environment variables (`.env.production`) serve as the second-tier source, overridden by runtime overrides.
- Changes to `CONFIG_CATALOG` definitions require code review. Runtime overrides are applied via the API/UI.

## Provenance Chain

Every effective configuration value carries a provenance tag indicating its source:

1. **override** — Applied at runtime via API or UI. Stored in PostgreSQL with full audit trail.
2. **env** — Loaded from environment variables at service startup.
3. **default** — Hardcoded in `CONFIG_CATALOG`.

## Safety Enforcement

Config items have safety tiers that are enforced on all runtime overrides:

| Safety | Enforcement |
| :--- | :--- |
| `immutable` | Rejected at runtime. Requires a signed deploy. |
| `tighten_only` | Can only move in the safer direction (per `riskDirection`). |
| `raise_only` | Can only be increased. |
| `append_only` | Items can be added but not removed. |
| `tunable` | Unrestricted changes allowed. |

## Validation Enforcement

Configuration validation is enforced at multiple levels:

1. **Schema validation**: Every override is validated against the item's schema (type, min, max) before acceptance.
2. **Safety validation**: Directional constraints enforced per safety tier.
3. **CI workflow**: `.github/workflows/ci.yml` runs `npm run validate:config`.
4. **Pre-deploy check**: `.github/workflows/deploy.yml` runs `npm run validate:config` before copying artifacts to VPS.

```bash
npm run validate:config
```

If validation fails, deployment must be blocked until fixed.

## Audit Trail

Every configuration change generates a signed `ConfigReceipt` containing:

- Unique receipt ID
- Key, previous value, new value
- Operator ID and reason
- HMAC-SHA256 signature (using `HMAC_SECRET`)
- Timestamp

Receipts are stored in PostgreSQL and queryable via `GET /config/receipts`.

## Preset Profiles

Three pre-defined risk profiles (`conservative`, `balanced`, `aggressive`) can be applied as coordinated sets of overrides via `POST /config/preset/:name`. Each preset overrides multiple parameters atomically. Preset application follows the same safety enforcement as individual overrides.

## Change Control

- **Runtime overrides**: Applied via admin-guarded API (`POST /config/override`). Require a text reason.
- **Catalog changes**: All changes to `CONFIG_CATALOG` require a pull request and approval.
- **Emergency rollback**: Any override can be rolled back instantly via `DELETE /config/override` or the UI rollback button.
- **Audit**: All changes are logged with receipts and queryable via API.

## Ownership

- `CONFIG_CATALOG` and `ConfigRegistry.ts` are owned by the platform team.
- Phase-specific config items (`phase.*`) are owned by the respective phase team.
- Risk-related items require Risk Officer sign-off for catalog changes.
