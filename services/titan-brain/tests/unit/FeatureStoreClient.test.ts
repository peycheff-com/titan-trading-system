import { FeatureStoreClient } from "../../src/ml/FeatureStoreClient";
import Redis from "ioredis";

// Mock dependencies
jest.mock("ioredis"); // Auto-mocks the default export

describe("FeatureStoreClient Unit", () => {
    let client: FeatureStoreClient;
    let mockLogger: any;
    let mockRedis: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockLogger = {
            debug: jest.fn(),
            error: jest.fn(),
        };

        // Create mock redis instance
        mockRedis = new (Redis as unknown as jest.Mock)();

        client = new FeatureStoreClient(mockLogger, mockRedis);
    });

    it("should store feature successfully", async () => {
        const featureRef = { name: "f1", value: [1.2, 0.5] };
        await client.put("f1", [1.2, 0.5], { version: "v1" });

        expect(mockRedis.set).toHaveBeenCalledWith(
            "titan:features:f1",
            expect.stringContaining('"name":"f1"'),
        );
        expect(mockLogger.debug).toHaveBeenCalled();
    });

    it("should retrieve feature successfully", async () => {
        const stored = { name: "f1", value: [123], timestamp: 1000 };
        mockRedis.get.mockResolvedValue(JSON.stringify(stored));

        const result = await client.get("f1");

        expect(mockRedis.get).toHaveBeenCalledWith("titan:features:f1");
        expect(result).toEqual(stored);
    });

    it("should handle retrieval failure gracefully", async () => {
        mockRedis.get.mockRejectedValue(new Error("Redis died"));

        const result = await client.get("f1");

        expect(mockLogger.error).toHaveBeenCalled();
        expect(result).toBeNull();
    });

    // Disconnect is a no-op managed by factory
    // it("should disconnect", async () => {
    //     await client.disconnect();
    //     expect(mockRedis.quit).toHaveBeenCalled();
    // });
});
