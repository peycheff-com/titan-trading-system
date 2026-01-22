import { DatabaseManager } from '../DatabaseManager.js';
import {
  CreateLedgerTransactionDTO,
  LedgerAccount,
  LedgerAccountType,
  LedgerDirection,
  LedgerTransaction,
} from '../../types/ledger.js';
import { Logger } from '../../logging/Logger.js';

export class LedgerRepository {
  private logger = Logger.getInstance('ledger-repository');

  constructor(private db: DatabaseManager) {}

  /**
   * Get or Create a Ledger Account by Name + Currency
   */
  async getOrCreateAccount(
    name: string,
    currency: string,
    type: LedgerAccountType,
  ): Promise<LedgerAccount> {
    // Try fetch
    const existing = await this.db.queryOne<LedgerAccount>(
      `SELECT * FROM ledger_accounts WHERE name = $1 AND currency = $2`,
      [name, currency],
    );
    if (existing) return existing;

    // Create
    return await this.db.insert<LedgerAccount>('ledger_accounts', {
      name,
      currency,
      type,
      metadata: {},
    });
  }

  /**
   * Create a balanced Ledger Transaction
   */
  async createTransaction(dto: CreateLedgerTransactionDTO): Promise<void> {
    // 1. Validate Balance
    const sum = dto.entries.reduce((acc, e) => acc + e.amount * e.direction, 0);
    if (Math.abs(sum) > 0.00000001) {
      throw new Error(
        `Transaction is not balanced! Sum: ${sum}. Correlation: ${dto.correlation_id}`,
      );
    }

    await this.db.transaction(async (client) => {
      // 2. Insert Header
      const txRes = await client.query(
        `INSERT INTO ledger_transactions (correlation_id, event_type, description, metadata)
                 VALUES ($1, $2, $3, $4)
                 RETURNING id`,
        [dto.correlation_id, dto.event_type, dto.description, dto.metadata || {}],
      );
      const txId = txRes.rows[0].id;

      // 3. Insert Entries via Account Lookup
      for (const entry of dto.entries) {
        // Resolve Account ID (Naive get-or-create inside tx scope)
        // Note: ideally we cache this or do it outside, but for safety lets check DB
        const accountRes = await client.query(
          `SELECT id FROM ledger_accounts WHERE name = $1 AND currency = $2`,
          [entry.account_name, entry.currency],
        );

        // eslint-disable-next-line functional/no-let
        let accountId: string;
        if (accountRes.rows.length === 0) {
          // Fail if account doesn't exist? Or auto-create?
          // Auto-create for now with default ASSET type if unknown, but better to fail.
          // Actually, we should assume accounts exist or are created by the repository helper.
          // Let's create if missing for robustness, default to ASSET.
          const newAcc = await client.query(
            `INSERT INTO ledger_accounts (name, currency, type) VALUES ($1, $2, 'ASSET') RETURNING id`,
            [entry.account_name, entry.currency],
          );
          accountId = newAcc.rows[0].id;
        } else {
          accountId = accountRes.rows[0].id;
        }

        await client.query(
          `INSERT INTO ledger_entries (tx_id, account_id, direction, amount)
                     VALUES ($1, $2, $3, $4)`,
          [txId, accountId, entry.direction, entry.amount],
        );
      }
    });
  }

  /**
   * Check if a transaction exists (Idempotency)
   */
  async transactionExists(correlationId: string): Promise<boolean> {
    const res = await this.db.queryOne(
      `SELECT 1 FROM ledger_transactions WHERE correlation_id = $1`,
      [correlationId],
    );
    return !!res;
  }

  /**
   * Get recent transactions
   */
  async getRecentTransactions(limit: number, offset: number): Promise<any[]> {
    const res = await this.db.query(
      `SELECT * FROM ledger_transactions ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    return res.rows;
  }

  /**
   * Get transaction by ID or Correlation ID
   */
  async getTransactionById(id: string): Promise<any> {
    // Try precise ID match first, then correlation
    const tx = await this.db.queryOne<any>(
      `SELECT * FROM ledger_transactions WHERE id = $1 OR correlation_id = $1`,
      [id],
    );

    if (!tx) return null;

    // Fetch entries
    const entriesRes = await this.db.query(
      `SELECT e.*, a.name as account_name, a.currency 
             FROM ledger_entries e
             JOIN ledger_accounts a ON e.account_id = a.id
             WHERE e.tx_id = $1`,
      [tx.id],
    );

    return {
      ...tx,
      entries: entriesRes.rows,
    };
  }

  /**
   * Get aggregated balances
   */
  async getBalances(): Promise<any[]> {
    const res = await this.db.query(
      `SELECT 
                a.name, 
                a.currency, 
                a.type,
                SUM(e.amount * e.direction) as balance
             FROM ledger_entries e
             JOIN ledger_accounts a ON e.account_id = a.id
             GROUP BY a.id, a.name, a.currency, a.type
             ORDER BY a.name, a.currency`,
    );
    return res.rows;
  }
}
