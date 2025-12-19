/**
 * Account API Routes
 * 
 * Handles account information queries.
 */

/**
 * Register account routes
 * @param {Object} fastify - Fastify instance
 * @param {Object} options - Route options
 * @param {Object} options.brokerGateway - BrokerGateway instance
 * @param {Object} options.logger - Logger instance
 */
export async function accountRoutes(fastify, options) {
  const { brokerGateway, logger } = options;

  /**
   * Get account information
   * GET /api/account
   */
  fastify.get('/account', async (request, reply) => {
    try {
      const account = await brokerGateway.getAccount();

      return reply.send({
        success: true,
        account: {
          equity: account.equity || 0,
          cash: account.cash || 0,
          margin_used: account.margin_used || 0,
          margin_available: account.margin_available || 0,
          unrealized_pnl: account.unrealized_pnl || 0,
        },
      });
    } catch (error) {
      logger.error({
        error: error.message,
      }, 'Failed to get account information');

      return reply.send({
        success: false,
        error: error.message,
        account: {
          equity: 0,
          cash: 0,
          margin_used: 0,
          margin_available: 0,
          unrealized_pnl: 0,
        },
      });
    }
  });
}

export default accountRoutes;
