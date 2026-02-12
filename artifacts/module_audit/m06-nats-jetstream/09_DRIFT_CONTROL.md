# Drift Control: M06 NATS JetStream

## 1. Definition of Truth
- **Infrastructure**: `packages/shared/src/messaging/nats-streams.ts` is the Source of Truth for Stream/Subject/Consumer topology.
- **Configuration**: `config/nats.conf` is the Source of Truth for Server/Auth/Account topology.

## 2. Drift Detection
- **Mechanism**: `check_nats.js` (Proposed Update) should query the running NATS server (`$JS.API.STREAM.INFO`) and compare against `TITAN_STREAMS` definitions.
- **Frequency**: On deployment and nightly audit.

## 3. Reconciliation
- **Automatic**: `NatsClient::ensureStreams()` attempts to create/update streams on startup.
- **Manual**: If `ensureStreams()` fails (e.g., destructive change required like changing storage type), operator must intervene using `nats` CLI.

## 4. Invariants to Check
- Stream Name matches.
- Subjects match.
- Retention Policy matches.
- Max Msgs / Max Bytes match.
