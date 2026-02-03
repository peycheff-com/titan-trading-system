/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
import { TitanBrain } from "../src/engine/TitanBrain.js";
import { ManualOverrideService } from "../src/engine/ManualOverrideService.js";
import { DatabaseManager } from "../src/db/DatabaseManager.js";

// Mock Dependencies
class MockDatabaseManager extends DatabaseManager {
    constructor() {
        super({} as never);
    }

    async queryOne<T>(_text: string, params: unknown[]): Promise<T | null> {
        if (typeof params[0] === "string" && params[0] === "admin") {
            return {
                operator_id: "admin",
                hashed_password:
                    "7b18b593929b8c4f6fcdbbc2126bd381dc1804e150985346e41b65f948cb3c2d", // sha256('password' + 'titan_salt')
                permissions: '["admin"]',
                last_login: null,
            } as T;
        }
        return null;
    }

    async query(
        _text: string,
        _params: unknown[],
    ): Promise<Record<string, unknown>> {
        return {};
    }
}

async function runTest() {
    console.log("Starting Brain Auth Integration Test...");

    const mockDb = new MockDatabaseManager();

    const overrideService = new ManualOverrideService(mockDb, {
        maxOverrideDurationHours: 1,
        requiredPermissions: ["admin"],
        warningBannerTimeout: 1000,
    });

    console.log("Testing ManualOverrideService.authenticateOperator...");

    // Test 1: Valid Credentials
    const result1 = await overrideService.authenticateOperator(
        "admin",
        "password",
    );
    if (result1) {
        console.log("✅ Test 1 Passed: Valid credentials authenticated");
    } else {
        console.error("❌ Test 1 Failed: Valid credentials failed");
    }

    // Test 2: Invalid Password
    const result2 = await overrideService.authenticateOperator(
        "admin",
        "wrong_password",
    );
    if (!result2) {
        console.log("✅ Test 2 Passed: Invalid password rejected");
    } else {
        console.error("❌ Test 2 Failed: Invalid password accepted");
    }

    // Test 3: Non-existent User
    const result3 = await overrideService.authenticateOperator(
        "ghost",
        "password",
    );
    if (!result3) {
        console.log("✅ Test 3 Passed: Non-existent user rejected");
    } else {
        console.error("❌ Test 3 Failed: Non-existent user accepted");
    }

    console.log("Testing TitanBrain Delegation...");
    // Mock TitanBrain (Partial) to test delegation
    const mockBrain = {
        manualOverrideService: overrideService,
        verifyOperatorCredentials:
            TitanBrain.prototype.verifyOperatorCredentials,
    };

    // Test 4: Delegation Success
    const result4 = await mockBrain.verifyOperatorCredentials(
        "admin",
        "password",
    );
    if (result4) {
        console.log("✅ Test 4 Passed: Delegation working (Success case)");
    } else {
        console.error("❌ Test 4 Failed: Delegation failed (Success case)");
    }

    // Test 5: Delegation Failure
    const result5 = await mockBrain.verifyOperatorCredentials("admin", "wrong");
    if (!result5) {
        console.log("✅ Test 5 Passed: Delegation working (Failure case)");
    } else {
        console.error("❌ Test 5 Failed: Delegation failed (Failure case)");
    }
}

runTest().catch(console.error);
