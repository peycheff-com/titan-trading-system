import { connect, JetStreamManager, StreamInfo } from 'nats';
import { TITAN_STREAMS, type TitanStreamConfig } from '../../packages/shared/src/messaging/nats-streams.js';

async function verifyJetStream() {
  const natsUrl = process.env.NATS_URL || 'nats://localhost:4222';
  console.log(`🔌 Connecting to NATS at ${natsUrl}...`);

  try {
    const nc = await connect({ servers: natsUrl });
    const jsm = await nc.jetstreamManager();
    console.log('✅ Connected.');

    const streams: TitanStreamConfig[] = Object.values(TITAN_STREAMS) as TitanStreamConfig[];
    console.log(`\n🔍 Verifying ${streams.length} streams defined in code...`);

    let driftCount = 0;

    for (const streamConfig of streams) {
      console.log(`\nChecking Stream: ${streamConfig.name}`);
      try {
        const info: StreamInfo = await jsm.streams.info(streamConfig.name);
        const config = info.config as any;

        // Check Max Messages
        if (config.max_msgs !== streamConfig.max_msgs) {
          console.error(`❌ DRIFT [max_msgs]: Expected ${streamConfig.max_msgs}, Got ${config.max_msgs}`);
          driftCount++;
        } else {
          console.log(`✅ max_msgs: ${config.max_msgs}`);
        }

        // Check Max Bytes
        const actualMaxBytes = config.max_bytes as number | undefined;
        if (streamConfig.max_bytes && actualMaxBytes !== streamConfig.max_bytes) {
          console.error(
            `❌ DRIFT [max_bytes]: Expected ${streamConfig.max_bytes}, Got ${actualMaxBytes}`,
          );
          driftCount++;
        } else if (streamConfig.max_bytes) {
            console.log(`✅ max_bytes: ${actualMaxBytes}`);
        }

        // Check Max Age
        if (config.max_age !== streamConfig.max_age_ns) {
             // NATS reports max_age in nanoseconds, config is in nanoseconds.
             console.error(`❌ DRIFT [max_age]: Expected ${streamConfig.max_age_ns}, Got ${config.max_age}`);
             driftCount++;
        } else {
            console.log(`✅ max_age: ${config.max_age}`);
        }

        // Check Storage
        if (config.storage !== streamConfig.storage) {
            console.error(`❌ DRIFT [storage]: Expected ${streamConfig.storage}, Got ${config.storage}`);
            driftCount++;
        } else {
            console.log(`✅ storage: ${config.storage}`);
        }

      } catch (err: any) {
        if (err.message.includes('stream not found')) {
          console.error(`❌ MISSING: Stream ${streamConfig.name} does not exist on server.`);
          driftCount++;
        } else {
          console.error(`⚠️ Error retrieving info for ${streamConfig.name}:`, err.message);
        }
      }
    }

    console.log('\n================================');
    if (driftCount === 0) {
      console.log('✅ VERIFICATION SUCCEEDED: No drift detected.');
      process.exit(0);
    } else {
      console.error(`❌ VERIFICATION FAILED: Detected ${driftCount} drift issues.`);
      process.exit(1);
    }

  } catch (err) {
    console.error('Fatal execution error:', err);
    process.exit(1);
  }
}

verifyJetStream();
