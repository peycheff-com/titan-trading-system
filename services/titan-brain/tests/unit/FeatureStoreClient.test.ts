import { FeatureStoreClient } from "@/ml/FeatureStoreClient";
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

        // Redis mock is auto-mocked, but we want to inspect the instance
        // When `new Redis()` is called, it returns correct mock
        // We can get the instance from the mock constructor

        client = new FeatureStoreClient(mockLogger, "redis://localhost:6379");

        // Access private redis instance or use the mock constructor to get instance
        // Since `client.redis` is private, we can cast or use (Redis as unknown as jest.Mock).mock.instances[0]
        mockRedis = (Redis as unknown as jest.Mock).mock.instances[0];
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

    it("should disconnect", async () => {
        await client.disconnect();
        expect(mockRedis.quit).toHaveBeenCalled();
    });
});
