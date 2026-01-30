/**
 * Swarm Service Module
 *
 * Re-exports SwarmOrchestrator for multi-asset parallel analysis.
 */

export {
    getSwarmOrchestrator,
    type MarketAnalysisTask,
    resetSwarmOrchestrator,
    type SwarmAnalysisResult,
    type SwarmConfig,
    SwarmOrchestrator,
    type SwarmSignal,
    type SwarmStatus,
} from "./SwarmOrchestrator.js";

export {
    type EnhancedRegimeResult,
    getSwarmChangePointIntegration,
    resetSwarmChangePointIntegration,
    type SwarmChangePointConfig,
    SwarmChangePointIntegration,
} from "./SwarmChangePointIntegration.js";
