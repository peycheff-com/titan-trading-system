/**
 * Route registration helpers for better organization
 */

/**
 * Build legacy route dependencies object
 * @param {Object} components - Component instances
 * @param {Object} state - Application state
 * @param {Object} config - Configuration
 * @param {Object} loggerAdapter - Logger instance
 * @returns {Object} Dependencies object
 */
export function buildLegacyDependencies(components, state, config, loggerAdapter) {
  return {
    config,
    shadowState: components.shadowState,
    replayGuard: components.replayGuard,
    wsCache: components.wsCache,
    l2Validator: components.l2Validator,
    brokerGateway: components.brokerGateway,
    orderManager: components.orderManager,
    phaseManager: components.phaseManager,
    safetyGates: components.safetyGates,
    configManager: components.configManager,
    databaseManager: components.databaseManager,
    preparedIntents: state.preparedIntents,
    wsStatus: state.wsStatus,
    getMasterArm: state.getMasterArm,
    setMasterArm: state.setMasterArm,
    logger: loggerAdapter,
  };
}

/**
 * Register legacy routes (to be migrated to plugin pattern)
 * @param {Object} fastify - Fastify instance
 * @param {Object} components - Component instances
 * @param {Object} state - Application state
 * @param {Object} config - Configuration
 * @param {Object} loggerAdapter - Logger instance
 */
export async function registerLegacyRoutes(fastify, components, state, config, loggerAdapter) {
  const { 
    registerHealthRoutes,
    registerWebhookRoutes,
    registerStateRoutes,
    registerStatusRoutes,
    registerDatabaseRoutes,
  } = await import('../routes/index.js');

  const deps = buildLegacyDependencies(components, state, config, loggerAdapter);

  registerHealthRoutes(fastify, deps);
  registerWebhookRoutes(fastify, deps);
  registerStateRoutes(fastify, deps);
  registerStatusRoutes(fastify, deps);
  registerDatabaseRoutes(fastify, deps);
}

/**
 * Register modern plugin-based routes
 * @param {Object} fastify - Fastify instance
 * @param {Object} components - Component instances
 * @param {Object} loggerAdapter - Logger instance
 */
export async function registerModernRoutes(fastify, components, loggerAdapter) {
  const [
    { default: configRoutes },
    { default: positionRoutes },
    { default: accountRoutes },
    { default: tradesRoutes },
  ] = await Promise.all([
    import('../routes/config.js'),
    import('../routes/positions.js'),
    import('../routes/account.js'),
    import('../routes/trades.js'),
  ]);

  await fastify.register(configRoutes, {
    prefix: '/api/config',
    configManager: components.configManager,
    brokerGateway: components.brokerGateway,
    logger: loggerAdapter,
  });

  await fastify.register(positionRoutes, {
    prefix: '/api',
    brokerGateway: components.brokerGateway,
    shadowState: components.shadowState,
    logger: loggerAdapter,
  });

  await fastify.register(accountRoutes, {
    prefix: '/api',
    brokerGateway: components.brokerGateway,
    logger: loggerAdapter,
  });

  await fastify.register(tradesRoutes, {
    prefix: '/api',
    databaseManager: components.databaseManager,
    logger: loggerAdapter,
  });
}