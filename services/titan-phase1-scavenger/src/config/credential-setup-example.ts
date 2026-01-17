/**
 * Example: Setting up and using CredentialManager
 *
 * This example demonstrates how to:
 * 1. Set up credentials for the first time
 * 2. Load existing credentials
 * 3. Update specific exchange credentials
 * 4. Validate credentials
 *
 * IMPORTANT: Set TITAN_MASTER_PASSWORD environment variable before running:
 * export TITAN_MASTER_PASSWORD="your-secure-password-12345"
 */

import { CredentialManager, ExchangeCredentials } from "./CredentialManager.js";

async function main() {
  console.log("🔐 Credential Manager Example\n");

  // Check if master password is set
  if (!process.env.TITAN_MASTER_PASSWORD) {
    console.error("❌ TITAN_MASTER_PASSWORD environment variable not set");
    console.log("Please set it first:");
    console.log('  export TITAN_MASTER_PASSWORD="your-secure-password-12345"');
    process.exit(1);
  }

  // Create credential manager instance
  const credManager = new CredentialManager();
  console.log(
    `📁 Credentials will be stored at: ${credManager.getCredentialsPath()}\n`,
  );

  // Check if credentials already exist
  if (credManager.credentialsExist()) {
    console.log("✅ Credentials file already exists");
    console.log("Loading existing credentials...\n");

    try {
      const creds = credManager.loadCredentials();
      console.log("Loaded credentials for:");
      console.log(`  - Binance: ${creds.binance.apiKey ? "✓" : "✗"}`);
      console.log(`  - Bybit: ${creds.bybit.apiKey ? "✓" : "✗"}`);
      console.log(`  - MEXC: ${creds.mexc.apiKey ? "✓" : "✗"}`);
      console.log();
    } catch (error) {
      console.error(
        "❌ Failed to load credentials:",
        error instanceof Error ? error.message : "Unknown error",
      );
      process.exit(1);
    }
  } else {
    console.log("📝 No credentials found. Setting up for the first time...\n");

    // Example credentials (replace with your actual credentials)
    const credentials: ExchangeCredentials = {
      binance: {
        apiKey: "your-binance-api-key-here",
        apiSecret: "your-binance-api-secret-here",
      },
      bybit: {
        apiKey: "your-bybit-api-key-here",
        apiSecret: "your-bybit-api-secret-here",
      },
      mexc: {
        apiKey: "your-mexc-api-key-here", // Optional
        apiSecret: "your-mexc-api-secret-here", // Optional
      },
    };

    // Validate credentials before saving
    console.log("Validating credentials...");
    const errors = credManager.validateCredentials(credentials);

    if (errors.length > 0) {
      console.error("❌ Credential validation failed:");
      errors.forEach((error: any) => console.error(`  - ${error}`));
      console.log("\nPlease fix the errors and try again.");
      process.exit(1);
    }

    console.log("✅ Credentials are valid\n");

    // Save credentials
    try {
      credManager.saveCredentials(credentials);
      console.log("✅ Credentials saved successfully!\n");
    } catch (error) {
      console.error(
        "❌ Failed to save credentials:",
        error instanceof Error ? error.message : "Unknown error",
      );
      process.exit(1);
    }
  }

  // Example: Update a specific exchange
  console.log("Example: Updating Binance credentials...");
  try {
    credManager.updateExchangeCredentials(
      "binance",
      "updated-binance-key",
      "updated-binance-secret",
    );
    console.log("✅ Binance credentials updated\n");
  } catch (error) {
    console.error(
      "❌ Failed to update credentials:",
      error instanceof Error ? error.message : "Unknown error",
    );
  }

  // Example: Load and use credentials
  console.log("Example: Loading credentials for use...");
  try {
    const creds = credManager.loadCredentials();

    // In a real application, you would use these credentials with exchange clients:
    // const binanceClient = new BinanceClient(creds.binance.apiKey, creds.binance.apiSecret);
    // const bybitClient = new BybitClient(creds.bybit.apiKey, creds.bybit.apiSecret);

    console.log("✅ Credentials loaded successfully");
    console.log("Ready to use with exchange clients!\n");
  } catch (error) {
    console.error(
      "❌ Failed to load credentials:",
      error instanceof Error ? error.message : "Unknown error",
    );
  }

  // Security reminder
  console.log("🔒 Security Reminders:");
  console.log("  1. Never commit your master password to version control");
  console.log("  2. Use a strong master password (12+ characters)");
  console.log("  3. Add .env to .gitignore if using environment files");
  console.log("  4. Rotate API keys regularly");
  console.log("  5. Use read-only API keys when possible");
}

// Run the example
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
