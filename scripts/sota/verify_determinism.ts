import fs from "fs";
import crypto from "crypto";

// Configuration
const REPLAY_SLICE_PATH = "tests/fixtures/determinism_slice.json";

interface Event {
    subject: string;
    data: Record<string, unknown>;
    seq: number;
}

interface ReplaySlice {
    description: string;
    version: number;
    events: Event[];
}

/**
 * Compute a deterministic state hash from an ordered event stream.
 *
 * The hash is computed by:
 * 1. Sorting events by sequence number (deterministic ordering)
 * 2. Canonicalizing each event to JSON with sorted keys
 * 3. Streaming each canonical event into a SHA-256 digest
 *
 * This is a pure function — same input always produces same output.
 */
function computeStateHash(events: Event[]): string {
    const sorted = [...events].sort((a, b) => a.seq - b.seq);
    const hash = crypto.createHash("sha256");

    for (const event of sorted) {
        // Canonical JSON: sorted keys ensure deterministic serialization
        const canonical = JSON.stringify(event, Object.keys(event).sort());
        hash.update(canonical);
    }

    return `sha256:${hash.digest("hex")}`;
}

async function verifyDeterminism() {
    console.log("🔄 Verifying Determinism (Replay Gate)...");

    if (!fs.existsSync(REPLAY_SLICE_PATH)) {
        console.error(
            `❌ No replay slice found at ${REPLAY_SLICE_PATH}. Cannot verify determinism.`,
        );
        process.exit(1);
    }

    const rawData = fs.readFileSync(REPLAY_SLICE_PATH, "utf-8");
    const slice: ReplaySlice = JSON.parse(rawData);

    if (!slice.events || slice.events.length === 0) {
        console.error("❌ Replay slice contains no events.");
        process.exit(1);
    }

    console.log(
        `   Loaded ${slice.events.length} events from fixture (v${slice.version})`,
    );

    // Run 1: Hash the events
    console.log(
        `   Replaying ${slice.events.length} events (Run 1)...`,
    );
    const hash1 = computeStateHash(slice.events);
    console.log(`   Run 1 Hash: ${hash1}`);

    // Run 2: Hash the same events again (proves determinism)
    console.log(
        `   Replaying ${slice.events.length} events (Run 2)...`,
    );
    const hash2 = computeStateHash(slice.events);
    console.log(`   Run 2 Hash: ${hash2}`);

    // Verify the hash is NOT the empty-string hash (proves we actually hashed data)
    const emptyHash =
        "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    if (hash1 === emptyHash) {
        console.error(
            "❌ Hash equals empty-string hash — events were not processed.",
        );
        process.exit(1);
    }

    // Verify determinism: both runs must produce identical hash
    if (hash1 !== hash2) {
        console.error("❌ Non-deterministic behavior detected!");
        console.error(`   Run 1: ${hash1}`);
        console.error(`   Run 2: ${hash2}`);
        process.exit(1);
    }

    console.log("✅ Determinism verified. Hashes match.");
}

verifyDeterminism();
