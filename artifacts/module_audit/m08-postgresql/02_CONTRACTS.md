# Module M08 — PostgreSQL: Contracts

> **Status**: **DRAFT**

## 1. Data Integrity

- **Foreign Keys**: Enforced on all relations.
- **Constraints**: `CHECK` constraints on price/quantity (> 0).
- **Types**: Strong typing (`TIMESTAMPTZ`, `NUMERIC` for money).

## 2. Performance

- **Max Connections**: 200 (Hard limit).
- **Query Timeout**: 30s (Global default).
