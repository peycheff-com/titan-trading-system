import { connect } from 'nats';

async function checkJetStream() {
  const natsUrl = process.env.NATS_URL || 'nats://localhost:4222';
  console.log(`Connecting to NATS at ${natsUrl}...`);

  try {
    const nc = await connect({ 
      servers: natsUrl,
      user: process.env.NATS_USER || 'brain',
      pass: process.env.NATS_PASS || 'brain_password'
    });
    const js = nc.jetstream();
    const jsm = await nc.jetstreamManager();

    console.log('✅ Connected to NATS');

    // List Streams
    const streams = await jsm.streams.list().next();
    console.log('\n📦 JetStream Streams:');
    if (streams.length === 0) {
        console.log('   (No streams found)');
    }
    for (const s of streams) {
      console.log(`   - ${s.config.name}`);
      console.log(`     Subjects: ${s.config.subjects.join(', ')}`);
      console.log(`     Storage: ${s.config.storage}`);
      console.log(`     Retention: ${s.config.retention}`);
      console.log(`     Max Msgs: ${s.config.max_msgs}`);
      console.log(`     Max Age: ${s.config.max_age / 1000000000}s`);
    }

    // List Consumers
    for (const s of streams) {
        console.log(`\n👥 Consumers for stream '${s.config.name}':`);
        const consumers = await jsm.consumers.list(s.config.name).next();
        if (consumers.length === 0) {
            console.log('   (No consumers found)');
        }
        for (const c of consumers) {
            console.log(`   - ${c.name} (Durable: ${c.config.durable_name || 'No'})`);
        }
    }

    await nc.close();
  } catch (err) {
    console.error('❌ Failed to check JetStream:', err);
    process.exit(1);
  }
}

checkJetStream();
