import { fetch } from "undici";

const EXECUTION_URL = "http://localhost:8080";

async function main() {
    console.log("--- Verifying Config Switching ---");

    const configUpdate = {
        exchange: "bybit",
        api_key: "TEST_KEY",
        api_secret: "TEST_SECRET",
        network: "testnet",
    };

    try {
        console.log("Sending Config Update (Switch to Testnet)...");
        const response = await fetch(`${EXECUTION_URL}/api/config`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(configUpdate),
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(
                `Failed to update config: ${response.status} ${response.statusText} - ${text}`,
            );
        }

        const result = await response.json();
        console.log("SUCCESS: Config Update Accepted", result);
        console.log(
            'Check Titan Execution logs: Should see "Re-initializing Adapter" and "Testnet: true".',
        );
    } catch (error) {
        console.error("VERIFICATION FAILED:", error);
        console.log("Ensure Titan Execution is running on port 8080");
        process.exit(1);
    }
}

main();
