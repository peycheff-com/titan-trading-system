import {
  getNatsClient,
  OpsCommandSchemaV1,
  type OpsCommandV1,
  OpsReceiptSchemaV1,
  OpsReceiptStatus,
  type OpsReceiptV1,
  TITAN_SUBJECTS,
  verifyOpsCommand, // Use shared implementation
} from '@titan/shared';
import dotenv from 'dotenv';
import { CommandExecutor } from './CommandExecutor.js';
// import { verifySignature } from './security.js'; // Removed
import { v4 as uuidv4 } from 'uuid';
import os from 'os';

dotenv.config();

const OPS_SECRET = process.env.OPS_SECRET;

async function main() {
  console.log('[titan-opsd] Starting (v1.0.0)...');

  if (!OPS_SECRET) {
    console.error('[titan-opsd] FATAL: OPS_SECRET env var is missing.');
    process.exit(1);
  }

  const executor = new CommandExecutor();

  try {
    const nats = getNatsClient();
    await nats.connect({
      name: 'titan-opsd',
      servers: [process.env.NATS_URL || 'nats://localhost:4222'],
    });

    console.log(`[titan-opsd] Connected to NATS. Listening on ${TITAN_SUBJECTS.OPS.COMMAND}...`);

    nats.subscribe(TITAN_SUBJECTS.OPS.COMMAND, async (data: unknown, subject: string) => {
      const start = Date.now();
      console.log(`[titan-opsd] Received command on subject: ${subject}`);

      // Validate Schema
      // NatsClient already decodes JSON, so data should be an object
      const parseResult = OpsCommandSchemaV1.safeParse(data);
      if (!parseResult.success) {
        console.error('[titan-opsd] Schema validation failed', parseResult.error);
        return;
      }
      const cmd = parseResult.data;

      // Verify Signature
      if (!verifyOpsCommand(cmd, OPS_SECRET!)) {
        console.error(`[titan-opsd] Signature verification failed for cmd ${cmd.id}`);
        await sendReceipt(
          nats,
          cmd,
          OpsReceiptStatus.FAILURE,
          undefined,
          'Invalid HMAC signature',
          0,
        );
        return;
      }

      // Execute
      try {
        console.log(`[titan-opsd] Executing ${cmd.type} target=${cmd.target}`);
        const result = await executor.execute(cmd);
        const duration = Date.now() - start;
        await sendReceipt(nats, cmd, OpsReceiptStatus.SUCCESS, result, undefined, duration);
        console.log(`[titan-opsd] Command ${cmd.id} executed in ${duration}ms`);
      } catch (err) {
        const duration = Date.now() - start;
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[titan-opsd] Execution failed for ${cmd.id}:`, err);
        await sendReceipt(nats, cmd, OpsReceiptStatus.FAILURE, undefined, message, duration);
      }
    });
  } catch (error) {
    console.error('[titan-opsd] Fatal startup error:', error);
    process.exit(1);
  }
}

async function sendReceipt(
  nats: { publish: (subj: string, data: unknown) => Promise<void> },
  cmd: OpsCommandV1,
  status: OpsReceiptStatus,
  result?: Record<string, unknown>,
  error?: string,
  durationMs: number = 0,
) {
  const receipt: OpsReceiptV1 = {
    v: 1,
    id: uuidv4(),
    command_id: cmd.id,
    ts: new Date().toISOString(),
    type: cmd.type,
    status,
    result,
    error,
    meta: {
      executor_id: os.hostname(),
      duration_ms: durationMs,
    },
  };

  // Validate outgoing receipt for strictness
  try {
    const validReceipt = OpsReceiptSchemaV1.parse(receipt);
    await nats.publish(TITAN_SUBJECTS.OPS.RECEIPT, validReceipt);
  } catch (e) {
    console.error('[titan-opsd] Failed to publish receipt', e);
  }
}

main();
