import { GoldenPath } from "./GoldenPath.js";
import parseArgs from "minimist";

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const natsUrl = args.nats || "nats://localhost:4222";
    const symbol = args.symbol || "BTC/USD";
    const side = (args.side || "BUY").toUpperCase();

    const harness = new GoldenPath({ natsUrl });

    try {
        await harness.start();

        console.log("--- Starting Golden Path Verification ---");
        console.log(`Parameters: ${symbol} ${side}`);

        const result = await harness.runScenario(
            symbol,
            side as "BUY" | "SELL",
        );

        console.log("--- Verification SUCCESS ---");
        console.log(JSON.stringify(result, null, 2));

        process.exit(0);
    } catch (error) {
        console.error("--- Verification FAILED ---");
        console.error(error);
        process.exit(1);
    } finally {
        await harness.stop();
    }
}

main();
