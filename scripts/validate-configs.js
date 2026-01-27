import * as fs from "fs";
import * as path from "path";
import { BrainConfigSchema, ConfigValidator, InfrastructureConfigSchema, PhaseConfigSchema, } from "../services/shared/src/config/ConfigSchema";
const CONFIG_DIR = path.join(__dirname, "../config");
// ANSI colors
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";
function logSuccess(msg) {
    console.log(`${GREEN}✔ ${msg}${RESET}`);
}
function logError(msg) {
    console.error(`${RED}✘ ${msg}${RESET}`);
}
function logWarning(msg) {
    console.log(`${YELLOW}⚠ ${msg}${RESET}`);
}
function validateFile(filename, schema, description) {
    const filePath = path.join(CONFIG_DIR, filename);
    if (!fs.existsSync(filePath)) {
        logWarning(`${description} config file not found: ${filename}`);
        return true; // Not an error if optional, but here we assume if it exists we validate
    }
    try {
        const content = fs.readFileSync(filePath, "utf-8");
        const data = JSON.parse(content);
        const result = ConfigValidator.validate(schema, data);
        if (result.valid) {
            logSuccess(`Validated ${filename} (${description})`);
            return true;
        }
        else {
            logError(`Validation failed for ${filename}:`);
            result.errors.forEach((e) => console.error(`  - ${e}`));
            return false;
        }
    }
    catch (err) {
        logError(`Failed to process ${filename}: ${err.message}`);
        return false;
    }
}
async function main() {
    console.log("Starting configuration validation...\n");
    let hasErrors = false;
    // 1. Brain Config
    if (!validateFile("brain.config.json", BrainConfigSchema, "Brain")) {
        hasErrors = true;
    }
    // 2. Infrastructure Config
    if (!validateFile("infrastructure.config.json", InfrastructureConfigSchema, "Infrastructure")) {
        hasErrors = true;
    }
    // 3. Phase Configs
    // Determine if we have specific phase config files or a pattern
    const files = fs.readdirSync(CONFIG_DIR);
    for (const file of files) {
        if (file.startsWith("phase") && file.endsWith(".config.json")) {
            if (!validateFile(file, PhaseConfigSchema, `Phase (${file})`)) {
                hasErrors = true;
            }
        }
        else if (file.startsWith("titan-") && file.endsWith(".config.json")) {
            // Service configs
            const serviceName = file.replace(".config.json", "");
            // Check if we have a schema for this service
            // ConfigValidator.getAvailableServiceSchemas() returns keys of ServiceConfigSchemas
            // But we can check ServiceConfigSchemas directly if exported, or use the validateServiceConfig method if we know the service name.
            // We need to check if the service name matches a schema key
            const availableSchemas = ConfigValidator
                .getAvailableServiceSchemas();
            if (availableSchemas.includes(serviceName)) {
                // We have to read the file manually to pass data to helper, or just use validateFile with the schema
                const filePath = path.join(CONFIG_DIR, file);
                try {
                    const content = fs.readFileSync(filePath, "utf-8");
                    const data = JSON.parse(content);
                    const result = ConfigValidator.validateServiceConfig(serviceName, data);
                    if (result.valid) {
                        logSuccess(`Validated ${file} (Service: ${serviceName})`);
                    }
                    else {
                        logError(`Validation failed for ${file}:`);
                        result.errors.forEach((e) => console.error(`  - ${e}`));
                        hasErrors = true;
                    }
                }
                catch (err) {
                    logError(`Failed to process ${file}: ${err.message}`);
                    hasErrors = true;
                }
            }
            else {
                // No specific schema, maybe warn or skip?
                // Titan services might not all have schemas yet. ConfigSchema.ts only showed titan-brain.
                // We can optionally validate if it exists.
                logWarning(`No strictly defined schema for service: ${serviceName}. Skipping validation.`);
            }
        }
    }
    if (hasErrors) {
        console.error(`\n${RED}Configuration validation failed.${RESET}`);
        process.exit(1);
    }
    else {
        console.log(`\n${GREEN}All configurations validated successfully.${RESET}`);
    }
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=validate-configs.js.map