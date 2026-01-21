# Configuration Governance

## Source of Truth

- `config/` is the authoritative source for runtime configuration.
- Environment variables override config where required by deployment.
- Changes to production configuration must go through code review.

## Validation Enforcement

Configuration validation is enforced in CI and before deployment.

- CI workflow: `.github/workflows/ci.yml` runs `npm run validate:config`.
- Pre-deploy check: `.github/workflows/deploy.yml` runs `npm run validate:config` before copying
  artifacts to the VPS.

## Required Validation Gates

Run the following before any production change:

```bash
npm run validate:config
```

If validation fails, deployment must be blocked until fixed.

## Change Control

- All config changes require a pull request and approval.
- Emergency changes require an incident ticket and must be validated immediately after.
- Maintain a changelog of config updates and associated risk review.

## Runtime Updates

If runtime config hot-reload is enabled, updates must still pass schema validation. Rollbacks should
be performed via prior validated versions.

## Ownership

- Brain and shared config schemas are owned by the platform team.
- Phase-specific config files are owned by the respective phase team.
