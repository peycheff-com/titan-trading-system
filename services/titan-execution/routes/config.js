/**
 * Titan Configuration API Routes
 * 
 * Endpoints for configuration versioning and rollback:
 * - GET /api/config/versions - List config versions
 * - GET /api/config/current - Get current active config
 * - POST /api/config/rollback - Rollback to previous version
 * - GET /api/config/proposals - Get pending proposals
 * - POST /api/config/proposals/:id/approve - Approve proposal
 * - POST /api/config/proposals/:id/reject - Reject proposal
 */

async function configRoutes(fastify, options) {
  const { configVersioning, strategicMemory, guardrails, backtester, configManager } = options;

  /**
   * GET /api/config/versions
   * List configuration version history
   */
  fastify.get('/api/config/versions', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', default: 10 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            versions: { type: 'array' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { limit } = request.query;
    const versions = await configVersioning.getVersionHistory(limit);
    return { versions };
  });

  /**
   * GET /api/config/current
   * Get current active configuration version
   */
  fastify.get('/api/config/current', async (request, reply) => {
    const current = await configVersioning.getCurrentVersion();
    
    if (!current) {
      return reply.code(404).send({
        error: 'No active configuration version found'
      });
    }
    
    return current;
  });

  /**
   * POST /api/config/rollback
   * Rollback to a previous configuration version
   */
  fastify.post('/api/config/rollback', {
    schema: {
      body: {
        type: 'object',
        properties: {
          targetVersionTag: { type: 'string' },
          confirm: { type: 'boolean' }
        },
        required: ['targetVersionTag', 'confirm']
      }
    }
  }, async (request, reply) => {
    const { targetVersionTag, confirm } = request.body;
    
    if (!confirm) {
      return reply.code(400).send({
        success: false,
        error: 'Confirmation required. Set confirm: true to proceed.'
      });
    }
    
    const result = await configVersioning.rollback(targetVersionTag, 'api');
    
    if (!result.success) {
      return reply.code(400).send(result);
    }
    
    return result;
  });

  /**
   * GET /api/config/proposals
   * Get pending optimization proposals
   */
  fastify.get('/api/config/proposals', async (request, reply) => {
    const proposals = await strategicMemory.getPendingProposals();
    return { proposals };
  });

  /**
   * GET /api/config/proposals/:id
   * Get a specific proposal
   */
  fastify.get('/api/config/proposals/:id', async (request, reply) => {
    const { id } = request.params;
    const proposals = await strategicMemory.getPendingProposals();
    const proposal = proposals.find(p => p.id === parseInt(id));
    
    if (!proposal) {
      return reply.code(404).send({ error: 'Proposal not found' });
    }
    
    return proposal;
  });

  /**
   * POST /api/config/proposals/:id/approve
   * Approve and apply a proposal
   */
  fastify.post('/api/config/proposals/:id/approve', {
    schema: {
      body: {
        type: 'object',
        properties: {
          confirm: { type: 'boolean' }
        },
        required: ['confirm']
      }
    }
  }, async (request, reply) => {
    const { id } = request.params;
    const { confirm } = request.body;
    
    if (!confirm) {
      return reply.code(400).send({
        success: false,
        error: 'Confirmation required'
      });
    }
    
    // Get proposal
    const proposals = await strategicMemory.getPendingProposals();
    const proposal = proposals.find(p => p.id === parseInt(id));
    
    if (!proposal) {
      return reply.code(404).send({ error: 'Proposal not found' });
    }
    
    // Validate against guardrails
    const validation = await guardrails.validateProposal(proposal);
    if (!validation.valid) {
      return reply.code(400).send({
        success: false,
        error: 'Proposal violates guardrails',
        violations: validation.violations
      });
    }
    
    // Run backtest validation
    if (backtester && proposal.oldConfig && proposal.newConfig) {
      const backtestResult = await backtester.compareConfigs(
        proposal.oldConfig,
        proposal.newConfig
      );
      
      if (!backtestResult.valid) {
        return reply.code(400).send({
          success: false,
          error: 'Proposal failed backtest validation',
          reason: backtestResult.reason
        });
      }
    }
    
    // Mark as approved
    await strategicMemory.reviewProposal(parseInt(id), true);
    
    // Apply new config
    if (configManager && proposal.newConfig) {
      const currentConfig = configManager.getConfig();
      const mergedConfig = { ...currentConfig, ...proposal.newConfig };
      await configManager.updateConfig(mergedConfig);
      
      // Create new version
      await configVersioning.createVersion(
        mergedConfig,
        `Applied proposal: ${proposal.topic}`,
        'api'
      );
    }
    
    // Mark as applied
    await strategicMemory.markAsApplied(parseInt(id));
    
    return {
      success: true,
      message: `Proposal "${proposal.topic}" approved and applied`
    };
  });

  /**
   * POST /api/config/proposals/:id/reject
   * Reject a proposal
   */
  fastify.post('/api/config/proposals/:id/reject', {
    schema: {
      body: {
        type: 'object',
        properties: {
          reason: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params;
    const { reason } = request.body;
    
    await strategicMemory.reviewProposal(parseInt(id), false, reason);
    
    return {
      success: true,
      message: 'Proposal rejected'
    };
  });

  /**
   * GET /api/config/briefing
   * Get unread morning briefing
   */
  fastify.get('/api/config/briefing', async (request, reply) => {
    const briefing = await strategicMemory.getUnreadBriefing();
    
    if (!briefing) {
      return { briefing: null };
    }
    
    return { briefing };
  });

  /**
   * POST /api/config/briefing/:id/read
   * Mark briefing as read
   */
  fastify.post('/api/config/briefing/:id/read', async (request, reply) => {
    const { id } = request.params;
    
    await strategicMemory.markBriefingRead(parseInt(id));
    
    return { success: true };
  });

  /**
   * GET /api/config/guardrails
   * Get current guardrail bounds
   */
  fastify.get('/api/config/guardrails', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          phase: { type: 'number' }
        }
      }
    }
  }, async (request, reply) => {
    const { phase } = request.query;
    const bounds = guardrails.getBounds(phase);
    return { bounds, phase: phase || 'global' };
  });

  /**
   * GET /api/config/insights/stats
   * Get strategic insights statistics
   */
  fastify.get('/api/config/insights/stats', async (request, reply) => {
    const stats = await strategicMemory.getStatistics();
    return stats;
  });
}

export default configRoutes;
