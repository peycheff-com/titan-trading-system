import { MarketMonitor } from "../polymarket/MarketMonitor.js";

async function main() {
    console.log("--- Verifying Sentinel Arb Logic ---");
    const monitor = new MarketMonitor(2000); // 2s interval

    console.log("Starting Monitor loop (will run for 10s)...");
    await monitor.start();

    // Let it run for 10 seconds to catch a few polls
    setTimeout(async () => {
        await monitor.stop();
        console.log("--- Verification Complete ---");
        console.log(
            'Check logs above for "[SIGNAL]" entries (unlikely on top active markets unless significant dislocation).',
        );
        process.exit(0);
    }, 10000);
}

main();
