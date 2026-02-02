import { connect, StringCodec } from "nats";
import { TITAN_SUBJECTS } from "@titan/shared";
import { PowerLawEstimator } from "./estimator.js";

export class PowerLawService {
  private estimator: PowerLawEstimator;

  constructor() {
    this.estimator = new PowerLawEstimator(
      process.env.NATS_URL || "nats://localhost:4222",
    );
  }

  async start() {
    console.log("Starting Titan Power Law Lab Service...");

    // Connect estimator (it manages its own publishing connection)
    await this.estimator.connect();

    // Connect local listener for market data
    const nc = await connect({
      servers: process.env.NATS_URL || "nats://localhost:4222",
      user: process.env.NATS_USER,
      pass: process.env.NATS_PASS,
      name: "titan-powerlaw-lab-listener",
    });
    console.log(`Deep-Listening to NATS at ${nc.getServer()}`);

    const sc = StringCodec();

    // Subscribe to market ticker data
    // Subject: titan.data.market.ticker.v1.{venue}.{symbol}
    const subject = TITAN_SUBJECTS.DATA.MARKET.ALL;
    const sub = nc.subscribe(subject);
    console.log(`Subscribed to ${subject}`);

    // Process loop
    (async () => {
      for await (const m of sub) {
        try {
          const subj = m.subject;
          const parts = subj.split(".");
          // Expected: titan.data.market.ticker.bybit.BTCUSDT
          // parts[4] = venue, parts[5] = symbol
          const venue = parts[4];
          const symbol = parts[5];

          if (!venue || !symbol) continue;

          const data = JSON.parse(sc.decode(m.data));

          // Expecting { price: number } or similar
          const price = data.price || data.c || data.last; // Robust fallback

          if (price) {
            // Fire and forget processing to keep up with stream
            this.estimator.onTick(venue, symbol, Number(price)).catch((err) => {
              console.error(
                `Error processing tick for ${venue}.${symbol}:`,
                err,
              );
            });
          }
        } catch (err) {
          // console.error("Error decoding market data:", err);
        }
      }
    })();

    // Keep alive
    return new Promise(() => {});
  }
}
