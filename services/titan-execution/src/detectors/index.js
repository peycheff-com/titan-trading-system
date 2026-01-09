/**
 * Detectors Index
 * 
 * Exports all Phase 1 detectors and the DetectorRegistry.
 * 
 * Requirements: 15.1-15.3 - Detector API Endpoints
 */

export { DetectorRegistry } from './DetectorRegistry.js';
export { OIWipeoutDetector } from './OIWipeoutDetector.js';
export { FundingSqueezeDetector } from './FundingSqueezeDetector.js';
export { BasisArbDetector } from './BasisArbDetector.js';
export { UltimateBulgariaProtocol } from './UltimateBulgariaProtocol.js';

/**
 * Initialize all detectors and register them with the registry
 * @param {Object} options - Configuration options
 * @param {Object} options.brokerGateway - BrokerGateway instance
 * @param {Object} [options.spotClient] - Spot exchange client
 * @param {Object} [options.cvdCalculator] - CVD calculator instance
 * @param {Object} [options.logger] - Logger instance
 * @returns {DetectorRegistry} Initialized registry with all detectors
 */
export function initializeDetectors(options = {}) {
  const { DetectorRegistry } = require('./DetectorRegistry.js');
  const { OIWipeoutDetector } = require('./OIWipeoutDetector.js');
  const { FundingSqueezeDetector } = require('./FundingSqueezeDetector.js');
  const { BasisArbDetector } = require('./BasisArbDetector.js');
  const { UltimateBulgariaProtocol } = require('./UltimateBulgariaProtocol.js');

  const registry = new DetectorRegistry({ logger: options.logger });

  // Create detector instances
  const oiDetector = new OIWipeoutDetector({
    brokerGateway: options.brokerGateway,
    cvdCalculator: options.cvdCalculator,
    logger: options.logger,
  });

  const fundingDetector = new FundingSqueezeDetector({
    brokerGateway: options.brokerGateway,
    cvdCalculator: options.cvdCalculator,
    logger: options.logger,
  });

  const basisDetector = new BasisArbDetector({
    brokerGateway: options.brokerGateway,
    spotClient: options.spotClient,
    logger: options.logger,
  });

  const ultimateDetector = new UltimateBulgariaProtocol({
    brokerGateway: options.brokerGateway,
    oiDetector,
    spotClient: options.spotClient,
    logger: options.logger,
  });

  // Register all detectors
  registry.register('oi_wipeout', oiDetector);
  registry.register('funding_squeeze', fundingDetector);
  registry.register('basis_arb', basisDetector);
  registry.register('ultimate_bulgaria', ultimateDetector);

  return registry;
}
