import { connect, JSONCodec, StringCodec } from "nats";
import { EventEmitter } from "events";
export class NatsClient extends EventEmitter {
    config;
    nc;
    jc = JSONCodec();
    sc = StringCodec();
    constructor(config) {
        super();
        this.config = config;
    }
    async connect() {
        try {
            this.nc = await connect({
                servers: this.config.servers,
                token: this.config.token,
                name: this.config.name || "titan-scavenger",
                maxReconnectAttempts: -1,
                waitOnFirstConnect: true,
            });
            console.log(`✅ Connected to NATS at ${this.config.servers}`);
            this.monitorConnection();
        }
        catch (err) {
            console.error("Error connecting to NATS:", err);
            throw err;
        }
    }
    async monitorConnection() {
        if (!this.nc)
            return;
        for await (const status of this.nc.status()) {
            console.log(`NATS Status: ${status.type} - ${status.data}`);
            if (status.type === "disconnect") {
                this.emit("disconnect");
            }
            else if (status.type === "reconnect") {
                this.emit("reconnect");
            }
        }
    }
    async publishSignal(signal) {
        if (!this.nc)
            throw new Error("Not connected to NATS");
        // Subject: titan.execution.intent.<source>.<symbol>
        // Example: titan.execution.intent.scavenger.BTCUSDT
        const subject = `titan.execution.intent.${signal.source}.${signal.symbol}`;
        // Add Scavenger specific metadata if needed
        const payload = {
            ...signal,
            timestamp: Date.now(),
            meta: {
                origin: "titan-phase1-scavenger",
                version: "1.0.0",
            },
        };
        console.log(`📤 Publishing signal to ${subject}`, payload.signal_id);
        this.nc.publish(subject, this.jc.encode(payload));
    }
    async subscribeToPowerLawMetrics(callback) {
        if (!this.nc)
            return;
        // Wildcard subscription
        const sub = this.nc.subscribe("powerlaw.metrics.>");
        // Create async iterator loop
        (async () => {
            for await (const m of sub) {
                try {
                    const data = this.jc.decode(m.data);
                    // Subject: powerlaw.metrics.<symbol>
                    const parts = m.subject.split(".");
                    if (parts.length >= 3) {
                        const symbol = parts[2];
                        callback(symbol, data);
                    }
                }
                catch (err) {
                    console.error("Error decoding metrics:", err);
                }
            }
        })();
        console.log("✅ Subscribed to Power Law metrics");
    }
    async close() {
        if (this.nc) {
            await this.nc.drain();
            await this.nc.close();
            console.log("NATS connection closed");
        }
    }
}
//# sourceMappingURL=NatsClient.js.map