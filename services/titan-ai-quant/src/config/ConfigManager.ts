import {
  ConfigManager as SharedConfigManager,
  getConfigManager,
  loadSecretsFromFiles,
} from '@titan/shared';

export class ConfigManager {
  private sharedManager: SharedConfigManager;

  constructor() {
    loadSecretsFromFiles();
    this.sharedManager = getConfigManager();
  }

  /**
   * Get a configuration value with type safety.
   * Use specific getters below for known keys.
   */
  get<T = string>(key: string): T | undefined {
    return process.env[key] as unknown as T;
  }

  /**
   * Get a required configuration value, throwing if missing.
   */
  getRequired(key: string): string {
    const value = this.get(key);
    if (!value) {
      throw new Error(`Missing required configuration: ${key}`);
    }
    return value as string;
  }

  // Specific getters enforcing schemas
  getGeminiKey(): string | undefined {
    return this.get<string>('GEMINI_API_KEY');
  }

  getPort(): number {
    const port = this.get('PORT');
    return port ? Number(port) : 8082;
  }

  getEnv(): string {
    return this.get('NODE_ENV') || 'development';
  }
}

export const configManager = new ConfigManager();
