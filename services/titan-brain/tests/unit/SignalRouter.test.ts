import { SignalRouter } from "@/engine/SignalRouter";
import { SignalProcessor } from "@/engine/SignalProcessor";

// Mock SignalProcessor
jest.mock("@/engine/SignalProcessor");

describe("SignalRouter Unit", () => {
    let router: SignalRouter;
    let mockProcessor: jest.Mocked<SignalProcessor>;

    beforeEach(() => {
        // Clear mocks
        jest.clearAllMocks();

        // Setup mock instance
        mockProcessor = {
            processSignal: jest.fn().mockResolvedValue({ action: "executed" }),
        } as any;

        router = new SignalRouter(mockProcessor);
    });

    it("should delegate processSignal to processor", async () => {
        const signal = { id: "1", phaseId: "phase1" } as any;
        await router.processSignal(signal);
        expect(mockProcessor.processSignal).toHaveBeenCalledWith(signal);
    });

    it("should process batch signals in priority order", async () => {
        const signals = [
            { id: "s1", phaseId: "phase1" },
            { id: "s3", phaseId: "phase3" },
            { id: "s2", phaseId: "phase2" },
            { id: "sm", phaseId: "manual" },
        ] as any[];

        const decisions = await router.processSignals(signals);

        expect(decisions).toHaveLength(4);
        expect(mockProcessor.processSignal).toHaveBeenCalledTimes(4);

        // Check call order: Manual(4) > Phase3(3) > Phase2(2) > Phase1(1)
        // Wait, SignalRouter logic:
        // phase3: 3, phase2: 2, phase1: 1, manual: 4
        // Sort descending: manual -> phase3 -> phase2 -> phase1

        const calls = mockProcessor.processSignal.mock.calls;
        expect(calls[0][0].phaseId).toBe("manual");
        expect(calls[1][0].phaseId).toBe("phase3");
        expect(calls[2][0].phaseId).toBe("phase2");
        expect(calls[3][0].phaseId).toBe("phase1");
    });
});
