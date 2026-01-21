import { DatabaseManager, DatabaseType } from "../../src/db/DatabaseManager.js";
import { FillsRepository } from "../../src/db/repositories/FillsRepository.js";
import { ExecutionReport } from "../../src/types/index.js";
import { v4 as uuidv4 } from "uuid";

// Mock Database Config
const dbConfig = {
    url: process.env.DATABASE_URL ||
        "postgres://postgres:postgres@localhost:5432/titan_brain_test",
    host: "localhost",
    port: 5432,
    database: "titan_brain_test",
    user: "postgres",
    password: "password",
};

async function verifyIdempotency() {
    console.log("🔍 Starting Idempotency Verification...");

    // 1. Setup DB
    const db = new DatabaseManager(dbConfig);
    // Force SQLite for this standalone test if PG not available, or use what's configured
    // checking if we can mock or use a temporary DB.
    // Ideally we use the same DatabaseManager logic.
    await db.connect();

    if (db.getDatabaseType() === DatabaseType.SQLITE) {
        console.warn(
            "⚠️ Using SQLite fallback. Idempotency ON CONFLICT behavior should still work.",
        );
        // We need to ensure the table covers are present in SQLite initialization if not using migrations
        // But DatabaseManager.initializeSQLiteSchema creates tables.
        // Let's verify `fills` table exists in SQLite schema in DatabaseManager.
        // Wait, I didn't see `fills` table in DatabaseManager.ts SQLite schema!
        // I need to check DatabaseManager again.
    }

    const fillsRepo = new FillsRepository(db);

    // 2. Prepare Duplicate Fills
    const fillId = `verify-${Date.now()}`;
    const fill: ExecutionReport = {
        type: "FILL",
        phaseId: "phase1", // Fixed: using string literal "phase1" which is a valid PhaseId
        symbol: "BTC/USDT",
        side: "BUY",
        price: 50000,
        qty: 0.1,
        timestamp: Date.now(),
        fillId: fillId,
        executionId: fillId,
        orderId: uuidv4(),
    };

    console.log(`📝 Inserting Fill 1: ${fillId}`);
    await fillsRepo.createFill(fill);

    console.log(`📝 Inserting Fill 2 (Duplicate): ${fillId}`);
    await fillsRepo.createFill(fill);

    // 3. Verify
    console.log("🕵️ Verifying Row Count...");

    // We need to query the DB directly to count. FillsRepo has getRecentFills.
    // But getRecentFills filters by symbol.
    const fills = await fillsRepo.getRecentFills("BTC/USDT", 100);
    const matchingFills = fills.filter((f) => f.fill_id === fillId);

    console.log(`📊 Found ${matchingFills.length} matching fills.`);

    if (matchingFills.length === 1) {
        console.log(
            "✅ SUCCESS: Idempotency Verified. Duplicate fill was ignored/merged.",
        );
        process.exit(0);
    } else {
        console.error(
            `❌ FAILURE: Found ${matchingFills.length} records for fill_id ${fillId}. Expected 1.`,
        );
        process.exit(1);
    }

    await db.disconnect();
}

verifyIdempotency().catch((err) => {
    console.error("❌ Unexpected Error:", err);
    process.exit(1);
});
