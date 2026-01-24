import { NatsConsumer } from "../../src/server/NatsConsumer";
import { TitanBrain } from "../../src/engine/TitanBrain";
import { getNatsClient, TitanSubject } from "@titan/shared";

// Mock dependencies
const mockBrain = {
    handleAIProposal: jest.fn().mockResolvedValue(undefined),
    handleExecutionReport: jest.fn(),
    handlePowerLawUpdate: jest.fn(),
    handleMarketData: jest.fn(),
} as unknown as TitanBrain;

const mockWebSocketService = {
    broadcastPhaseDiagnostics: jest.fn(),
};

describe("AI Wiring Integration", () => {
    let natsConsumer: NatsConsumer;
    let natsClient: any;

    beforeAll(async () => {
        natsClient = getNatsClient();
    });

    afterAll(async () => {
        if (natsConsumer) {
            await natsConsumer.stop();
        }
    });

    it("should subscribe to CMD_AI_OPTIMIZE_PROPOSAL", async () => {
        natsConsumer = new NatsConsumer(mockBrain, mockWebSocketService as any);

        // Mock isConnected to return true so start() skips connect()
        jest.spyOn(natsClient, "isConnected").mockReturnValue(true);
        // Mock subscribe to avoid "NATS client not connected" error and capture callback
        const subscribeSpy = jest.spyOn(natsClient, "subscribe")
            .mockImplementation(() => {
                return { unsubscribe: jest.fn() } as any;
            });

        await natsConsumer.start();

        expect(subscribeSpy).toHaveBeenCalledWith(
            TitanSubject.CMD_AI_OPTIMIZE_PROPOSAL,
            expect.any(Function),
            "BRAIN_GOVERNANCE",
        );
    });

    it("should route AI Proposal to Brain.handleAIProposal", async () => {
        natsConsumer = new NatsConsumer(mockBrain, mockWebSocketService as any);
        jest.spyOn(natsClient, "isConnected").mockReturnValue(true);

        // Capture the callback
        let capturedCallback: Function | undefined;
        jest.spyOn(natsClient, "subscribe").mockImplementation(
            (subject, cb) => {
                if (subject === TitanSubject.CMD_AI_OPTIMIZE_PROPOSAL) {
                    capturedCallback = cb;
                }
                return { unsubscribe: jest.fn() } as any;
            },
        );

        await natsConsumer.start();

        expect(capturedCallback).toBeDefined();

        const mockProposal = {
            target: "risk_policy",
            changes: { max_drawdown: 0.15 },
            reasoning: "High volatility regime detected",
        };

        // Simulate NATS message
        await capturedCallback!(
            mockProposal,
            TitanSubject.CMD_AI_OPTIMIZE_PROPOSAL,
        );

        expect(mockBrain.handleAIProposal).toHaveBeenCalledWith(mockProposal);
    });
});
