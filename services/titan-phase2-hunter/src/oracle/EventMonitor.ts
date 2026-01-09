import { EventEmitter } from "events";
import {
    EventAlert,
    ImpactLevel,
    PredictionMarketEvent,
} from "../types";
import { Enhanced2026ConfigManager } from "../config/Enhanced2026Config";

/**
 * Event Monitor
 *
 * Responsible for monitoring prediction market events for significant changes,
 * threshold crossings, and upcoming resolutions.
 *
 * Requirement 11.1: Implement prediction market event monitoring
 */
export class EventMonitor extends EventEmitter {
    private configManager: Enhanced2026ConfigManager;
    private previousEvents: Map<string, PredictionMarketEvent> = new Map();
    // Critical probability thresholds to watch for crossings
    private readonly CRITICAL_THRESHOLDS = [20, 50, 80];

    constructor(configManager: Enhanced2026ConfigManager) {
        super();
        this.configManager = configManager;
    }

    /**
     * Initialize monitor with initial state
     */
    public initialize(events: PredictionMarketEvent[]): void {
        this.updateState(events);
    }

    /**
     * Detect significant changes in events
     * Compares current events against previously stored state.
     */
    public detectSignificantChanges(
        currentEvents: PredictionMarketEvent[],
    ): EventAlert[] {
        const alerts: EventAlert[] = [];
        const config = this.configManager.getOracleConfig();
        const threshold = config.probabilityChangeThreshold || 10;

        for (const currentEvent of currentEvents) {
            const prevEvent = this.previousEvents.get(currentEvent.id);

            if (!prevEvent) {
                // New event detected
                // We generally don't alert on every new event unless it's high impact,
                // but tracking it is good practice. For now, logging silent info.
                continue;
            }

            // 1. Check for Rapid Probability Change (>10% default)
            const probChange = currentEvent.probability - prevEvent.probability;
            if (Math.abs(probChange) >= threshold) {
                alerts.push({
                    type: "probability_change",
                    severity: Math.abs(probChange) >= 20 ? "warning" : "info",
                    event: currentEvent,
                    details: `Probability changed by ${
                        probChange.toFixed(1)
                    }% (from ${prevEvent.probability}% to ${currentEvent.probability}%)`,
                    timestamp: new Date(),
                    previousProbability: prevEvent.probability,
                    newProbability: currentEvent.probability,
                });
            }

            // 2. Check for Critical Threshold Crossing
            for (const criticalLevel of this.CRITICAL_THRESHOLDS) {
                // Check if we crossed the level from below
                if (
                    prevEvent.probability < criticalLevel &&
                    currentEvent.probability >= criticalLevel
                ) {
                    alerts.push({
                        type: "threshold_crossing",
                        severity: "warning",
                        event: currentEvent,
                        details:
                            `Probability crossed above ${criticalLevel}% threshold`,
                        timestamp: new Date(),
                        previousProbability: prevEvent.probability,
                        newProbability: currentEvent.probability,
                    });
                }
                // Check if we crossed the level from above
                if (
                    prevEvent.probability > criticalLevel &&
                    currentEvent.probability <= criticalLevel
                ) {
                    alerts.push({
                        type: "threshold_crossing",
                        severity: "warning",
                        event: currentEvent,
                        details:
                            `Probability crossed below ${criticalLevel}% threshold`,
                        timestamp: new Date(),
                        previousProbability: prevEvent.probability,
                        newProbability: currentEvent.probability,
                    });
                }
            }
        }

        // Update internal state after processing
        this.updateState(currentEvents);

        // Emit alerts
        alerts.forEach((alert) => this.emit("alert", alert));

        return alerts;
    }

    /**
     * Get upcoming high impact events closing within the specified window
     * Requirement 11.3: Time-based risk adjustment
     */
    public getUpcomingHighImpactEvents(
        windowMinutes?: number,
    ): PredictionMarketEvent[] {
        const riskConfig = this.configManager.getConfig().enhancedRisk;
        const minutes = windowMinutes || riskConfig.eventProximityThreshold ||
            60;
        const cutoffTime = Date.now() + (minutes * 60 * 1000);

        return Array.from(this.previousEvents.values()).filter((event) => {
            // Must be High or Extreme impact
            const isHighImpact = event.impact === ImpactLevel.HIGH ||
                event.impact === ImpactLevel.EXTREME;
            if (!isHighImpact) return false;

            // Must be resolving soon
            return event.resolution.getTime() <= cutoffTime &&
                event.resolution.getTime() > Date.now();
        });
    }

    /**
     * Update internal state map
     */
    private updateState(events: PredictionMarketEvent[]): void {
        for (const event of events) {
            this.previousEvents.set(event.id, event);
        }
    }
}
