import { Logger } from "@titan/shared";
import { StateRecoveryService } from "./StateRecoveryService.js";
import { BrainStateManager } from "./BrainStateManager.js";
import { CapitalFlowManager } from "./CapitalFlowManager.js";
import { BrainConfig } from "../types/index.js";

const logger = Logger.getInstance("recovery-manager");

export class RecoveryManager {
    constructor(
        private readonly config: BrainConfig,
        private readonly stateRecoveryService: StateRecoveryService | null,
        private readonly stateManager: BrainStateManager,
        private readonly capitalFlowManager: CapitalFlowManager,
    ) {}

    /**
     * Recovers the brain state from persistence or initializes defaults.
     */
    async recoverState(): Promise<void> {
        if (this.stateRecoveryService) {
            const state = await this.stateRecoveryService.recoverState();
            if (state) {
                if (state.highWatermark) {
                    this.capitalFlowManager.setHighWatermark(
                        state.highWatermark,
                    );
                }

                // Recover positions
                if (state.positions && state.positions.length > 0) {
                    const currentPositions = this.stateManager.getPositions();
                    if (currentPositions.length === 0) {
                        state.positions.forEach((p) =>
                            this.stateManager.updatePosition(p)
                        );
                        logger.info(
                            `Recovered ${state.positions.length} positions`,
                        );
                    }
                }

                if (state.equity !== undefined) {
                    this.stateManager.setEquity(state.equity);
                } else {
                    this.stateManager.setEquity(this.config.initialCapital);
                }

                if (state.dailyStartEquity !== undefined) {
                    this.stateManager.setDailyStartEquity(
                        state.dailyStartEquity,
                    );
                } else {
                    this.stateManager.setDailyStartEquity(
                        this.config.initialCapital,
                    );
                }

                logger.info(
                    `State recovered: equity=${this.stateManager.getEquity()}, positionCount=${
                        state.positions?.length ?? 0
                    }`,
                );
            } else {
                // Default initialization if no state recovered
                this.initializeDefaults();
            }
        } else {
            // Default initialization if no state recovery service
            this.initializeDefaults();
        }
    }

    private initializeDefaults(): void {
        this.stateManager.setDailyStartEquity(this.config.initialCapital);
        this.stateManager.setEquity(this.config.initialCapital);
        logger.info("Initialized with default capital");
    }
}
