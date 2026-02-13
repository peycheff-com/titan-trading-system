#!/bin/bash
set -euo pipefail
# Toggle live trading mode by publishing canonical operator actions to NATS.
#
# Usage:
#   ./scripts/ops/set_trading_mode.sh arm "Reason" "operator_id"
#   ./scripts/ops/set_trading_mode.sh disarm "Reason" "operator_id"
#
# Env:
#   TITAN_ENV_FILE (default: .env.prod)
#   NATS_URL (default: nats://127.0.0.1:4222)
#   NATS_SYS_USER (default: sys)
#   NATS_SYS_PASSWORD (required, falls back to NATS_PASS)

set -euo pipefail

MODE="${1:-}"
REASON="${2:-Manual operator command}"
OPERATOR_ID="${3:-operator}"
ENV_FILE="${TITAN_ENV_FILE:-.env.prod}"

if [[ "${MODE}" != "arm" && "${MODE}" != "disarm" ]]; then
    echo "Usage: $0 <arm|disarm> [reason] [operator_id]"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

if [ -f "${ENV_FILE}" ]; then
    # shellcheck disable=SC1090
    set -a; source "${ENV_FILE}"; set +a
fi

NATS_URL="${NATS_URL:-nats://127.0.0.1:4222}"
NATS_SYS_USER="${NATS_SYS_USER:-sys}"
NATS_SYS_PASSWORD="${NATS_SYS_PASSWORD:-${NATS_PASS:-}}"

if [ -z "${NATS_SYS_PASSWORD:-}" ]; then
    echo "NATS_SYS_PASSWORD is required (set in ${ENV_FILE} or environment)."
    exit 1
fi

if [ "${MODE}" = "arm" ]; then
    SUBJECT="titan.cmd.operator.arm.v1"
    ACTION_TYPE="ARM_SYSTEM"
else
    SUBJECT="titan.cmd.operator.disarm.v1"
    ACTION_TYPE="DISARM_SYSTEM"
fi

PAYLOAD="$(node -e '
const crypto = require("crypto");
const [, actionType, reason, operatorId] = process.argv;
const payload = {
  id: crypto.randomUUID(),
  type: actionType,
  reason,
  operator_id: operatorId,
  timestamp: Date.now(),
};
process.stdout.write(JSON.stringify(payload));
' "${ACTION_TYPE}" "${REASON}" "${OPERATOR_ID}")"

node -e '
const { connect, StringCodec } = require("nats");

const [, url, user, pass, subject, payload] = process.argv;

(async () => {
  const nc = await connect({ servers: [url], user, pass, name: "titan-ops-mode-toggle" });
  const sc = StringCodec();
  nc.publish(subject, sc.encode(payload));
  await nc.flush();
  await nc.close();
  console.log(`Published ${subject}`);
  console.log(payload);
})().catch((err) => {
  console.error(`Failed to publish operator action: ${err.message}`);
  process.exit(1);
});
' "${NATS_URL}" "${NATS_SYS_USER}" "${NATS_SYS_PASSWORD}" "${SUBJECT}" "${PAYLOAD}"
