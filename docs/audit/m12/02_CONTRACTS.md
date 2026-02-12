# M12 Contracts

## API Surface (HTTP)

### Authentication
- `POST /auth/login`
    - **Input**: `{ operator_id, password }`
    - **Output**: `{ success: true, token, roles }`
    - **Contract**: Returns JWT signed with `JWT_SECRET`.

### Operations
- `POST /ops/command`
    - **Auth**: Bearer Token
    - **Input**: `{ type, target, params, reason }`
    - **Output**: `{ status: 'dispatched', command_id }`
    - **Side Effect**: Publishes signed `OpsCommand` to NATS.

### Credentials
- `GET /api/credentials`
    - **Auth**: Bearer Token
    - **Contract**: Returns masked credentials.
- `POST /api/credentials`
    - **Auth**: Bearer Token
    - **Input**: `{ provider, credentials: { apiKey, apiSecret }, metadata }`
- `DELETE /api/credentials/:provider`
- `POST /api/credentials/:provider/test`
    - **Contract**: Performs live connection test to `provider`.
- `GET /api/credentials/:provider/internal`
    - **Auth**: `X-Internal-Auth` header == `INTERNAL_AUTH_SECRET`
    - **Contract**: Returns **unmasked** decrypted credentials (for internal services).

## Message Contracts (NATS)

### Published
- **Subject**: `TITAN_SUBJECTS.OPS.COMMAND` (e.g., `titan.cmd.ops.command.v1`)
- **Schema**: `OpsCommandSchemaV1` (`@titan/shared`)
- **Guarantees**:
    - `signature`: HMAC calculated using `OPS_SECRET`.
    - `initiator_id`: Derived from authenticated JWT.

## Database Contracts
- **Schema**: `user_credentials`
- **Schema**: `credential_audit_log`
