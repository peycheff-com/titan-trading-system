import { fetch } from "undici";
import crypto from "crypto";

export interface SignalPayload {
    signal_id: string;
    type: "PREPARE" | "CONFIRM" | "ABORT";
    symbol: string;
    phase_id: string;
    [key: string]: any;
}

export class ExecutionClient {
    private baseUrl: string;
    private hmacSecret: string;

    constructor(
        baseUrl: string = process.env.TITAN_EXECUTION_URL ||
            "http://localhost:8080",
        hmacSecret: string = "dev-secret",
    ) {
        this.baseUrl = baseUrl;
        this.hmacSecret = process.env.HMAC_SECRET || hmacSecret;
    }

    async sendSignal(payload: SignalPayload): Promise<boolean> {
        const signature = this.generateSignature(payload);

        try {
            const response = await fetch(`${this.baseUrl}/webhook`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-source": "titan_sentinel",
                    "x-signature": signature,
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errText = await response.text();
                console.error(
                    `Execution Client Error (${response.status}): ${errText}`,
                );
                return false;
            }

            // console.log(`Signal dispatched: ${payload.signal_id}`);
            return true;
        } catch (error) {
            console.error("Failed to send signal:", error);
            return false;
        }
    }

    private generateSignature(body: any): string {
        return crypto
            .createHmac("sha256", this.hmacSecret)
            .update(JSON.stringify(body))
            .digest("hex");
    }
}
