import {
    ConfigManager as SharedConfigManager,
    getConfigManager,
} from "@titan/shared";

export class ConfigManager {
    private sharedManager: SharedConfigManager;

    constructor() {
        this.sharedManager = getConfigManager();
    }

    get(key: string): string | undefined {
        return process.env[key];
    }

    // Specific getters
    getGeminiKey(): string | undefined {
        return this.get("GEMINI_API_KEY");
    }

    getPort(): number {
        return Number(this.get("PORT")) || 4000;
    }
}

export const configManager = new ConfigManager();
