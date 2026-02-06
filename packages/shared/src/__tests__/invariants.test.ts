/**
 * invariants.test.ts - Living Documentation Tests
 *
 * Tier-1 Big Tech Practice: Executable Documentation
 *
 * These tests verify critical system invariants documented in:
 * docs/canonical/SYSTEM_SOURCE_OF_TRUTH.md
 *
 * Tests act as living documentation - if these fail, either the
 * invariant was violated or documentation needs updating.
 */

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const REPO_ROOT = join(__dirname, "../../../../..");

describe("System Invariants (Living Documentation)", () => {
    describe("I-04: Symbol Whitelist", () => {
        it("symbolWhitelist exists and is non-empty in risk_policy.json", () => {
            const policyPath = join(
                REPO_ROOT,
                "packages/shared/risk_policy.json",
            );
            expect(existsSync(policyPath), "risk_policy.json must exist").toBe(
                true,
            );

            const policy = JSON.parse(readFileSync(policyPath, "utf-8"));
            expect(policy.symbolWhitelist, "symbolWhitelist field must exist")
                .toBeDefined();
            expect(
                Array.isArray(policy.symbolWhitelist),
                "symbolWhitelist must be array",
            ).toBe(true);
            expect(
                policy.symbolWhitelist.length,
                "symbolWhitelist must not be empty",
            ).toBeGreaterThan(0);
        });
    });

    describe("I-02: HMAC Fail-Closed", () => {
        it("HmacValidator::new() contains panic! for empty secret", () => {
            const securityPath = join(
                REPO_ROOT,
                "services/titan-execution-rs/src/security.rs",
            );
            expect(existsSync(securityPath), "security.rs must exist").toBe(
                true,
            );

            const content = readFileSync(securityPath, "utf-8");
            expect(content).toContain("impl HmacValidator");
            expect(content).toContain("panic!");
        });
    });

    describe("I-16: RiskState Enum", () => {
        it("RiskState enum defines Normal, Cautious, Defensive, Emergency", () => {
            const riskPolicyPath = join(
                REPO_ROOT,
                "services/titan-execution-rs/src/risk_policy.rs",
            );
            expect(existsSync(riskPolicyPath), "risk_policy.rs must exist")
                .toBe(true);

            const content = readFileSync(riskPolicyPath, "utf-8");
            expect(content).toContain("enum RiskState");
            expect(content).toContain("Normal");
            expect(content).toContain("Cautious");
            expect(content).toContain("Defensive");
            expect(content).toContain("Emergency");
        });
    });

    describe("I-20: Risk Policy include_str!", () => {
        it("risk_policy.rs embeds policy via include_str!", () => {
            const riskPolicyPath = join(
                REPO_ROOT,
                "services/titan-execution-rs/src/risk_policy.rs",
            );
            expect(existsSync(riskPolicyPath), "risk_policy.rs must exist")
                .toBe(true);

            const content = readFileSync(riskPolicyPath, "utf-8");
            expect(content).toContain("include_str!");
        });
    });

    describe("I-11: TokenBucket Rate Limiter", () => {
        it("TokenBucket struct exists in rate_limiter.rs", () => {
            const rateLimiterPath = join(
                REPO_ROOT,
                "services/titan-execution-rs/src/rate_limiter.rs",
            );
            expect(existsSync(rateLimiterPath), "rate_limiter.rs must exist")
                .toBe(true);

            const content = readFileSync(rateLimiterPath, "utf-8");
            expect(content).toContain("struct TokenBucket");
        });
    });

    describe("I-12: RiskGuard Evaluate", () => {
        it("RiskGuard::evaluate() exists in risk_guard.rs", () => {
            const riskGuardPath = join(
                REPO_ROOT,
                "services/titan-execution-rs/src/risk_guard.rs",
            );
            expect(existsSync(riskGuardPath), "risk_guard.rs must exist").toBe(
                true,
            );

            const content = readFileSync(riskGuardPath, "utf-8");
            expect(content).toContain("RiskGuard");
            expect(content).toContain("evaluate");
        });
    });

    describe("I-17: Health Endpoints", () => {
        it("docker-compose.prod.yml contains healthcheck directives", () => {
            const composePath = join(REPO_ROOT, "docker-compose.prod.yml");
            expect(
                existsSync(composePath),
                "docker-compose.prod.yml must exist",
            ).toBe(true);

            const content = readFileSync(composePath, "utf-8");
            expect(content).toContain("healthcheck");
        });
    });

    describe("I-19: DLQ Constants", () => {
        it("DLQ_EXECUTION_CORE constant exists in subjects.rs", () => {
            const subjectsPath = join(
                REPO_ROOT,
                "services/titan-execution-rs/src/subjects.rs",
            );
            expect(existsSync(subjectsPath), "subjects.rs must exist").toBe(
                true,
            );

            const content = readFileSync(subjectsPath, "utf-8");
            expect(content).toContain("DLQ_EXECUTION_CORE");
        });
    });
});
