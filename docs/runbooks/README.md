# Runbooks & Procedures

[← Back to Index](../README.md)

> **Panic Button**: If you are deploying, see the [Production Guide](production_guide.md).

## 🚨 Incident Response

- [**Incident Response Framework**](incident_response.md) — The meta-guide for all incidents.
- [**Kill Switch**](kill_switch.md) — Emergency halt of all trading.
- [**Rollback Procedure**](rollback.md) — Emergency revert instructions.
- [**PowerLaw Modes**](powerlaw-modes.md) — Understanding system operating modes.

## 📉 Specific Outage Scenarios

- [**Exchange Outage**](exchange_outage.md) — When Bybit/Binance goes dark.
- [**NATS Outage**](nats_outage.md) — Event bus failure handling.
- [**Postgres Outage**](postgres_outage.md) — Database recovery.

## 📚 Guides

- [**Production Deployment Guide**](production_guide.md) — Manual vs CI deployment.
- [**Deploy Runbook**](deploy.md) — Step-by-step production deploy procedure.
- [**Key Rotation**](key_rotation.md) — Secret rotation for DB, HMAC, and exchange keys.
- [**Drill Scripts**](drill_scripts.md) — Incident drill scripts and report template.
