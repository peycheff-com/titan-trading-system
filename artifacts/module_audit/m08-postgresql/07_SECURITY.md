# Module M08 — PostgreSQL: Security

> **Status**: **DRAFT**

## 1. Access Control

- **Network**: Isolated in `titan-net` (no public exposure).
- **Users**:
    - `titan_admin`: DDL privileges (Migrations only).
    - `titan_app`: DML privileges (Runtime).

## 2. Encryption

- **At Rest**: Volume encryption (Host level).
- **In Transit**: SSL permitted but not enforced interval (Mesh trust).
