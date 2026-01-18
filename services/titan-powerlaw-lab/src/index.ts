import { PowerLawEstimator } from "./estimator.js";

// Simple mock loop for testing/demo purposes if no live data stream is connected yet
async function run() {
    const estimator = new PowerLawEstimator(
        process.env.NATS_URL || "nats://localhost:4222",
    );
    await estimator.connect();

    // In a real scenario, this service would subscribe to a market data topic.
    // For this lab, let's simulate a random walks for verifying logic.

    console.log(
        "Power Law Lab Service Started. Generating synthetic data for BTCUSDT...",
    );

    let price = 50000;

    setInterval(() => {
        // Geometric Brownian Motion with occasional fat tail jumps
        const u1 = Math.random();
        const u2 = Math.random();
        const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2); // Gaussian

        let returns = z * 0.001; // 0.1% vol

        // Insert fat tail event (simulated) 1% of time
        if (Math.random() < 0.01) {
            returns *= 10; // 10 sigma jump
        }

        price = price * Math.exp(returns);
        estimator.onTick("BTCUSDT", price);
    }, 100); // 100ms ticks
}

run().catch(console.error);
