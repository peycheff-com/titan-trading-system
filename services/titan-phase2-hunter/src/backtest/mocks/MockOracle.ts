import { Oracle } from "../../oracle/Oracle";
import {
    EventCategory,
    ImpactLevel,
    OracleScore,
    PredictionMarketEvent,
    TechnicalSignal,
} from "../../types";

export class MockOracle extends Oracle {
    private mockEvents: PredictionMarketEvent[] = [];
    private scoreOverride: Partial<OracleScore> | null = null;
    private currentTime: number = Date.now();
    private scheduledEvents: {
        timestamp: number;
        sentiment: number;
        confidence: number;
    }[] = [];

    constructor() {
        const mockConfigManager = {
            getOracleConfig: () => ({
                enabled: true,
                updateInterval: 300,
                polymarketApiKey: "mock-key",
                sentimentThreshold: 20,
                confidenceWeight: 0.5,
                vetoEnabled: true,
                maxEventsPerScan: 50,
                categories: ["crypto_price", "fed_policy"],
            }),
            getEventMonitorConfig: () => ({
                enabled: true,
                updateInterval: 300,
                alertThresholds: { probabilityChange: 10 },
            }),
        } as any;
        super(mockConfigManager);
    }

    public setCurrentTime(time: number) {
        this.currentTime = time;
    }

    public updateState(timestamp: number) {
        this.setCurrentTime(timestamp);
    }

    public addEvent(timestamp: number, sentiment: number, confidence: number) {
        this.scheduledEvents.push({ timestamp, sentiment, confidence });
    }

    public setMockEvents(events: PredictionMarketEvent[]) {
        this.mockEvents = events;
    }

    public setScoreOverride(override: Partial<OracleScore> | null) {
        this.scoreOverride = override;
    }

    public async evaluateSignal(signal: TechnicalSignal): Promise<OracleScore> {
        // Basic score calculation
        let sentiment = 0;
        let confidence = 50;
        let veto = false;
        let vetoReason: string | null = null;
        let convictionMultiplier = 1.0;

        // Filter events valid for the current time
        const activeEvents = this.mockEvents.filter((e) =>
            e.lastUpdate.getTime() <= this.currentTime &&
            e.resolution.getTime() > this.currentTime
        );

        // Simple logic: if 'crash' event exists with > 50% prob, veto LONG
        const crashEvent = activeEvents.find((e) =>
            e.title.toLowerCase().includes("crash") ||
            e.title.toLowerCase().includes("correction")
        );

        if (
            crashEvent && crashEvent.probability > 50 &&
            signal.direction === "LONG"
        ) {
            veto = true;
            vetoReason =
                `High probability of crash: ${crashEvent.title} (${crashEvent.probability}%)`;
        }

        // Apply overrides if any
        if (this.scoreOverride) {
            if (this.scoreOverride.sentiment !== undefined) {
                sentiment = this.scoreOverride.sentiment;
            }
            if (this.scoreOverride.confidence !== undefined) {
                confidence = this.scoreOverride.confidence;
            }
            if (this.scoreOverride.veto !== undefined) {
                veto = this.scoreOverride.veto;
            }
            if (this.scoreOverride.vetoReason !== undefined) {
                vetoReason = this.scoreOverride.vetoReason;
            }
            if (this.scoreOverride.convictionMultiplier !== undefined) {
                convictionMultiplier = this.scoreOverride.convictionMultiplier;
            }
        }

        // Check scheduled events first for overrides
        const scheduled = this.scheduledEvents.find((e) =>
            e.timestamp <= this.currentTime &&
            e.timestamp > this.currentTime - (24 * 60 * 60 * 1000)
        );

        if (scheduled) {
            sentiment = scheduled.sentiment;
            confidence = scheduled.confidence;
        }

        return {
            sentiment,
            confidence,
            events: activeEvents,
            veto: sentiment < -50 && signal.direction === "LONG" ||
                    sentiment > 50 && signal.direction === "SHORT"
                ? true
                : veto, // Simple veto logic from scheduled events
            vetoReason: scheduled
                ? `Scheduled Event Sentiment: ${sentiment}`
                : vetoReason,
            convictionMultiplier,
            timestamp: new Date(this.currentTime),
        };
    }

    // Helper to create a test event
    public static createEvent(
        title: string,
        probability: number,
        startTime: number,
        durationMinutes: number,
    ): PredictionMarketEvent {
        // This helper logic would ideally reside in a factory or utility
        // but useful here for quick mock setup
        return {
            id: `evt-${Math.random()}`,
            title,
            description: "Mock event",
            probability,
            volume: 100000,
            liquidity: 50000,
            category: EventCategory.MACRO_ECONOMIC,
            impact: ImpactLevel.HIGH,
            resolution: new Date(startTime + durationMinutes * 60000),
            lastUpdate: new Date(startTime),
            source: "polymarket",
            // Note: `timestamp` property might be missing in PredictionMarketEvent interface in types.ts?
            // Checking types.ts previously: PredictionMarketEvent had id, title, description, probability...
            // It has `lastUpdate` and `resolution`, but `evaluateSignal` usage might imply creation time.
            // Assuming existing types. Let's stick to the interface.
        } as any; // Using any to bypass potential strict mock data construction if interface has changed
    }
}
