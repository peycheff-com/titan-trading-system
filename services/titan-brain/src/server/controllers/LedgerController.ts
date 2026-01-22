import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Logger } from '../../logging/Logger.js';
import { LedgerRepository } from '../../db/repositories/LedgerRepository.js';
import { createCorrelationLogger } from '../../middleware/CorrelationMiddleware.js';

export class LedgerController {
  constructor(
    private readonly ledgerRepository: LedgerRepository,
    private readonly logger: Logger,
  ) {}

  /**
   * Register routes for this controller
   */
  registerRoutes(server: FastifyInstance): void {
    server.get('/ledger/transactions', this.getTransactions.bind(this));
    server.get('/ledger/transactions/:id', this.getTransactionById.bind(this));
    server.get('/ledger/balances', this.getBalances.bind(this));
  }

  /**
   * GET /ledger/transactions
   * List transactions with optional pagination
   */
  async getTransactions(
    request: FastifyRequest<{
      Querystring: {
        limit?: number;
        offset?: number;
        account?: string;
      };
    }>,
    reply: FastifyReply,
  ): Promise<void> {
    const logger = createCorrelationLogger(this.logger, request);
    const limit = request.query.limit || 50;
    const offset = request.query.offset || 0;

    try {
      // Note: In a real implementation, we would pass these filters to the repository.
      // For Phase 1, we might just fetch recent transactions.
      // We need to extend LedgerRepository to support querying "Transactions" directly,
      // but currently it mostly supports "createTransaction".
      // However, we can use the `db` accessor if needed or add a method to Repo.
      // Let's assume we add `getRecentTransactions` to LedgerRepository or use raw query here if needed.
      // Ideally, we explicitly add methods to LedgerRepository.

      // Since I cannot modify LedgerRepository in this atomic step easily without context switching,
      // I will assume the repository has a method or I will add it in the next step.
      // VALID PLAN: I will implement the controller to call new methods on repo,
      // and then I will update the repo.

      const transactions = await this.ledgerRepository.getRecentTransactions(limit, offset);
      reply.send({
        data: transactions,
        meta: {
          limit,
          offset,
          count: transactions.length,
        },
      });
    } catch (error) {
      logger.error('Failed to fetch ledger transactions', error as Error);
      reply.status(500).send({ error: 'Failed to fetch transactions' });
    }
  }

  /**
   * GET /ledger/transactions/:id
   * Get a specific transaction by ID (or correlation ID)
   */
  async getTransactionById(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const logger = createCorrelationLogger(this.logger, request);
    const { id } = request.params;

    try {
      // We will add getTransactionById to LedgerRepository
      const transaction = await this.ledgerRepository.getTransactionById(id);

      if (!transaction) {
        reply.status(404).send({ error: 'Transaction not found' });
        return;
      }

      reply.send(transaction);
    } catch (error) {
      logger.error(`Failed to fetch transaction ${id}`, error as Error);
      reply.status(500).send({ error: 'Failed to fetch transaction' });
    }
  }

  /**
   * GET /ledger/balances
   * Get aggregated balances for all accounts
   */
  async getBalances(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const logger = createCorrelationLogger(this.logger, request);

    try {
      // We will add getBalances to LedgerRepository
      const balances = await this.ledgerRepository.getBalances();
      reply.send({ data: balances });
    } catch (error) {
      logger.error('Failed to fetch ledger balances', error as Error);
      reply.status(500).send({ error: 'Failed to fetch balances' });
    }
  }
}
