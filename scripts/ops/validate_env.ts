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
    DATABASE_URL: z.string().optional(),
    TITAN_DB_HOST: z.string().optional(),
    TITAN_DB_NAME: z.string().optional(),
    TITAN_DB_USER: z.string().optional(),
    TITAN_DB_PASSWORD: z.string().optional(),

    // NATS Auth (System & Services)
    NATS_SYS_PASSWORD: z.string().optional(),
    NATS_BRAIN_PASSWORD: z.string().optional(),
    NATS_EXECUTION_PASSWORD: z.string().optional(),
    NATS_SCAVENGER_PASSWORD: z.string().optional(),
    NATS_HUNTER_PASSWORD: z.string().optional(),
    NATS_SENTINEL_PASSWORD: z.string().optional(),
    NATS_POWERLAW_PASSWORD: z.string().optional(),
    NATS_QUANT_PASSWORD: z.string().optional(),
    NATS_CONSOLE_PASSWORD: z.string().optional(),
    NATS_PASS: z.string().optional(),

    // Console/Auth
    JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),

    // Exchange Keys (At least one set typically required, but we enforce structure if present)
    BYBIT_API_KEY: z.string().optional(),
    BYBIT_API_SECRET: z.string().optional(),
    BINANCE_API_KEY: z.string().optional(),
    BINANCE_API_SECRET: z.string().optional(),
}).superRefine((env, ctx) => {
    const hasDatabaseUrl = Boolean(env.DATABASE_URL && env.DATABASE_URL.trim().length > 0);
    const hasDbParts = Boolean(
        env.TITAN_DB_HOST &&
        env.TITAN_DB_NAME &&
        env.TITAN_DB_USER &&
        env.TITAN_DB_PASSWORD,
    );

    if (!hasDatabaseUrl && !hasDbParts) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["DATABASE_URL"],
            message:
                "Provide DATABASE_URL or all TITAN_DB_HOST/TITAN_DB_NAME/TITAN_DB_USER/TITAN_DB_PASSWORD",
        });
    }

    const hasLegacyNatsPass = Boolean(env.NATS_PASS && env.NATS_PASS.trim().length > 0);
    const hasServiceNatsPasswords = Boolean(
        env.NATS_SYS_PASSWORD &&
        env.NATS_BRAIN_PASSWORD &&
        env.NATS_EXECUTION_PASSWORD &&
        env.NATS_SCAVENGER_PASSWORD &&
        env.NATS_HUNTER_PASSWORD &&
        env.NATS_SENTINEL_PASSWORD &&
        env.NATS_POWERLAW_PASSWORD &&
        env.NATS_QUANT_PASSWORD &&
        env.NATS_CONSOLE_PASSWORD,
    );

    if (!hasLegacyNatsPass && !hasServiceNatsPasswords) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["NATS_SYS_PASSWORD"],
            message:
                "Provide NATS_PASS (legacy single password) or all service passwords: NATS_SYS_PASSWORD, NATS_BRAIN_PASSWORD, NATS_EXECUTION_PASSWORD, NATS_SCAVENGER_PASSWORD, NATS_HUNTER_PASSWORD, NATS_SENTINEL_PASSWORD, NATS_POWERLAW_PASSWORD, NATS_QUANT_PASSWORD, NATS_CONSOLE_PASSWORD",
        });
    }

    const hasBinancePair = Boolean(
        env.BINANCE_API_KEY && env.BINANCE_API_SECRET,
    );
    const hasBybitPair = Boolean(
        env.BYBIT_API_KEY && env.BYBIT_API_SECRET,
    );

    if (!hasBinancePair && !hasBybitPair) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["BINANCE_API_KEY"],
            message:
                "At least one exchange keypair is required: BINANCE_API_KEY/BINANCE_API_SECRET or BYBIT_API_KEY/BYBIT_API_SECRET",
        });
    }
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
