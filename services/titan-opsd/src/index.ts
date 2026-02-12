import {
  getNatsClient,
  Logger,
  OpsCommandSchemaV1,
  type OpsCommandV1,
  OpsReceiptSchemaV1,
  OpsReceiptStatus,
  type OpsReceiptV1,
  TITAN_SUBJECTS,
  verifyOpsCommand,
} from '@titan/shared';
import dotenv from 'dotenv';
import { CommandExecutor } from './CommandExecutor.js';
import { v4 as uuidv4 } from 'uuid';
import os from 'os';

dotenv.config();

const OPS_SECRET = process.env.OPS_SECRET;
const log = Logger.getInstance('titan-opsd');

async function main() {
  log.info('Starting titan-opsd v1.0.0');

  if (!OPS_SECRET) {
    log.fatal('FATAL: OPS_SECRET env var is missing. Exiting.');
    process.exit(1);
  }

  const executor = new CommandExecutor();

  try {
    const nats = getNatsClient();
    await nats.connect({
      name: 'titan-opsd',
      servers: [process.env.NATS_URL || 'nats://localhost:4222'],
    });

    log.info(`Connected to NATS. Listening on ${TITAN_SUBJECTS.OPS.COMMAND}`);

    nats.subscribe(TITAN_SUBJECTS.OPS.COMMAND, async (data: unknown, subject: string) => {
      const start = Date.now();
      log.info('Received command', undefined, { subject });

      // Validate Schema
      const parseResult = OpsCommandSchemaV1.safeParse(data);
      if (!parseResult.success) {
        log.error('Schema validation failed', undefined, undefined, {
          error: parseResult.error.message,
        });
        return;
      }
      const cmd = parseResult.data;

      // Verify Signature
      if (!verifyOpsCommand(cmd, OPS_SECRET!)) {
        log.error('Signature verification failed', undefined, cmd.id, {
          command_id: cmd.id,
          type: cmd.type,
        });
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
        log.info(`Executing ${cmd.type} target=${cmd.target}`, cmd.id, {
          command_id: cmd.id,
          type: cmd.type,
          target: cmd.target,
        });
        const result = await executor.execute(cmd);
        const duration = Date.now() - start;
        await sendReceipt(nats, cmd, OpsReceiptStatus.SUCCESS, result, undefined, duration);
        log.info(`Command ${cmd.id} completed`, cmd.id, {
          command_id: cmd.id,
          duration_ms: duration,
        });
      } catch (err) {
        const duration = Date.now() - start;
        const error = err instanceof Error ? err : new Error(String(err));
        log.error(`Execution failed for ${cmd.id}`, error, cmd.id, {
          command_id: cmd.id,
          type: cmd.type,
          duration_ms: duration,
        });
        await sendReceipt(nats, cmd, OpsReceiptStatus.FAILURE, undefined, error.message, duration);
      }
    });

    // Graceful shutdown
    const shutdown = async () => {
      log.info('Shutting down titan-opsd...');
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.fatal('Fatal startup error', err);
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

  try {
    const validReceipt = OpsReceiptSchemaV1.parse(receipt);
    await nats.publish(TITAN_SUBJECTS.OPS.RECEIPT, validReceipt);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    log.error('Failed to publish receipt', err, cmd.id);
  }
}

main();
