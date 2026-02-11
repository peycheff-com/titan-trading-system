import { JetStreamManager } from 'nats';
import { Logger, TITAN_STREAMS } from '@titan/shared';

export async function verifyJetStreamConfiguration(
  jsm: JetStreamManager,
  logger: Logger,
): Promise<void> {
  const streams = await jsm.streams.list().next();
  const streamMap = new Map(streams.map((s) => [s.config.name, s.config]));

  for (const expected of TITAN_STREAMS) {
    const actual = streamMap.get(expected.name);
    if (!actual) {
      throw new Error(`CRITICAL: Missing JetStream Stream '${expected.name}'`);
    }

    if (actual.retention !== expected.retention) {
      throw new Error(
        `CRITICAL: Stream '${expected.name}' has wrong retention. Expected '${expected.retention}', got '${actual.retention}'`,
      );
    }

    if (actual.storage !== expected.storage) {
      logger.warn(
        `Stream '${expected.name}' storage mismatch. Expected '${expected.storage}', got '${actual.storage}'`,
      );
      if (expected.name === 'TITAN_CMD' || expected.name === 'TITAN_EVT') {
        throw new Error(
          `CRITICAL: Stream '${expected.name}' must use File storage for durability.`,
        );
      }
    }

    // Optional Check: Max Age (Approximate check due to conversion/defaults)
    if (expected.max_age && actual.max_age !== expected.max_age) {
      logger.warn(
        `Stream '${expected.name}' max_age mismatch. Expected ${expected.max_age}, got ${actual.max_age}`,
      );
    }

    logger.info(`   ✅ Verified Stream '${expected.name}'`);
  }
}
