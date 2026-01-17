import { ActiveInferenceEngine, MarketState } from "./ActiveInferenceEngine.js";
import { MarketSignal, SignalType } from "../types/index.js";

export class MockAdapter {
    private engine: ActiveInferenceEngine | null = null;

    registerEngine(engine: ActiveInferenceEngine) {
        this.engine = engine;
    }

    async emitSignal(signal: MarketSignal) {
        if (!this.engine) throw new Error("No engine registered");

        if (
            signal.type === SignalType.PRICE_UPDATE && signal.data &&
            typeof signal.data.price === "number"
        ) {
            const state: MarketState = {
                price: signal.data.price,
                volume: signal.data.volume || 0,
                timestamp: signal.timestamp,
            };
            this.engine.processUpdate(state);
        }
    }
}
