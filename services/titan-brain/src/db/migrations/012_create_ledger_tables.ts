import { Pool } from "pg";

export const version = 12;
export const name = "create_ledger_tables";

export async function up(pool: Pool): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // 1. Ledger Accounts (Chart of Accounts)
        await client.query(`
            CREATE TABLE IF NOT EXISTS ledger_accounts (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(100) NOT NULL,
                type VARCHAR(50) NOT NULL, -- Asset, Liability, Equity, Revenue, Expense
                currency VARCHAR(20) NOT NULL,
                metadata JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT uq_ledger_accounts_name_currency UNIQUE (name, currency)
            );
        `);

        // 2. Ledger Transactions (The atomic header)
        await client.query(`
            CREATE TABLE IF NOT EXISTS ledger_transactions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                correlation_id VARCHAR(100) NOT NULL, -- Link to Source (e.g., fill_id, funding_event_id)
                event_type VARCHAR(50) NOT NULL, -- FILL, FUNDING, TRANSFER
                description TEXT,
                posted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                metadata JSONB,
                CONSTRAINT uq_ledger_tx_correlation UNIQUE (correlation_id) -- Idempotency
            );
        `);

        // 3. Ledger Entries (The separate legs)
        await client.query(`
            CREATE TABLE IF NOT EXISTS ledger_entries (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tx_id UUID NOT NULL REFERENCES ledger_transactions(id),
                account_id UUID NOT NULL REFERENCES ledger_accounts(id),
                direction INTEGER NOT NULL CHECK (direction IN (1, -1)), -- 1 = Credit, -1 = Debit
                amount DECIMAL(24, 8) NOT NULL CHECK (amount >= 0),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Indexes for performance
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_ledger_entries_tx_id ON ledger_entries(tx_id);
            CREATE INDEX IF NOT EXISTS idx_ledger_entries_account_id ON ledger_entries(account_id);
            CREATE INDEX IF NOT EXISTS idx_ledger_tx_correlation ON ledger_transactions(correlation_id);
            CREATE INDEX IF NOT EXISTS idx_ledger_tx_posted_at ON ledger_transactions(posted_at DESC);
        `);

        // Enable Row Level Security (Standard practice in this repo)
        await client.query(`
            ALTER TABLE ledger_accounts ENABLE ROW LEVEL SECURITY;
            ALTER TABLE ledger_transactions ENABLE ROW LEVEL SECURITY;
            ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
        `);

        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function down(pool: Pool): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await client.query(`DROP TABLE IF EXISTS ledger_entries;`);
        await client.query(`DROP TABLE IF EXISTS ledger_transactions;`);
        await client.query(`DROP TABLE IF EXISTS ledger_accounts;`);
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}
