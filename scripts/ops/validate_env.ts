import { z } from "zod";
import * as process from "process";

// ANSI colors
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";

const EnvSchema = z.object({
    // Security
    HMAC_SECRET: z.string().min(1, "HMAC_SECRET is required"),
    TITAN_MASTER_PASSWORD: z.string().min(
        1,
        "TITAN_MASTER_PASSWORD is required for Operator Auth",
    ),

    // Infrastructure
    NATS_URL: z.string().default("nats://localhost:4222"),
    REDIS_URL: z.string().default("redis://localhost:6379"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

    // NATS Auth (System & Services)
    NATS_SYS_PASSWORD: z.string().min(
        1,
        "NATS_SYS_PASSWORD is required for production boot",
    ),
    NATS_BRAIN_PASSWORD: z.string().min(1, "NATS_BRAIN_PASSWORD is required"),
    NATS_EXECUTION_PASSWORD: z.string().min(
        1,
        "NATS_EXECUTION_PASSWORD is required",
    ),
    NATS_SCAVENGER_PASSWORD: z.string().min(
        1,
        "NATS_SCAVENGER_PASSWORD is required",
    ),
    NATS_HUNTER_PASSWORD: z.string().min(1, "NATS_HUNTER_PASSWORD is required"),
    NATS_SENTINEL_PASSWORD: z.string().min(
        1,
        "NATS_SENTINEL_PASSWORD is required",
    ),
    NATS_POWERLAW_PASSWORD: z.string().min(
        1,
        "NATS_POWERLAW_PASSWORD is required",
    ),
    NATS_QUANT_PASSWORD: z.string().min(1, "NATS_QUANT_PASSWORD is required"),
    NATS_CONSOLE_PASSWORD: z.string().min(
        1,
        "NATS_CONSOLE_PASSWORD is required",
    ),

    // Exchange Keys (At least one set typically required, but we enforce structure if present)
    BYBIT_API_KEY: z.string().optional(),
    BYBIT_API_SECRET: z.string().optional(),
    BINANCE_API_KEY: z.string().optional(),
    BINANCE_API_SECRET: z.string().optional(),
});

function validateEnv() {
    console.log("🔒 Validating Production Environment Variables...");

    const result = EnvSchema.safeParse(process.env);

    if (!result.success) {
        console.error(`${RED}❌ Environment Validation Failed:${RESET}`);
        // ZodError exposes .errors (ZodIssue[]) but sometimes type definition varies.
        // .issues is the robust alias in v3+.
        result.error.issues.forEach((err) => {
            // Use path to show which var failed
            const path = err.path.join(".");
            console.error(`   - ${path}: ${err.message}`);
        });
        console.error(
            `\n${RED}FATAL: Production boot prevented due to missing secrets.${RESET}`,
        );
        process.exit(1);
    }

    console.log(`${GREEN}✅ Environment Variables Validated.${RESET}`);
}

validateEnv();
