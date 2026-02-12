# M12 Failure Modes

## Critical Failures
1. **Secret Misconfiguration**:
    - If `OPS_SECRET` is missing, `POST /ops/command` throws 500.
    - **Remediation**: Check secrets at startup.
2. **Database Outage**:
    - Credential operations fail.
    - Auth (future state) fails.
    - **Remediation**: Implement DB health check in `/health`.
3. **NATS Outage**:
    - Ops commands fail to publish.
    - Service starts but is functionally impaired for heavy ops.
    - **Remediation**: Add NATS status to `/health`.

## Degraded States
- **Provider API Down**: `POST /.. /test` fails.
    - *Handled*: Returns success: false, distinct from internal error.

## Risks
- **CORS**: `*` origin allows any site to call API if user browser has access.
    - **Severity**: High (CSRF potential/Information Disclosure).
    - **Remediation**: Restrict `Access-Control-Allow-Origin`.
