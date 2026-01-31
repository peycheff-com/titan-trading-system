import {
    LeaderElector,
    LeaderElectorConfig,
} from "../../../src/coordination/LeaderElector";
import { NatsClient } from "../../../src/messaging/NatsClient";
import { Logger } from "../../../src/logger/Logger";

// Mock NatsClient and KV
const mockKv = {
    get: jest.fn(),
    put: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
};

const mockJs = {
    views: {
        kv: jest.fn().mockResolvedValue(mockKv),
    },
};

const mockNatsClient = {
    getJetStream: jest.fn().mockReturnValue(mockJs),
} as unknown as NatsClient;

const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
} as unknown as Logger;

describe("LeaderElector", () => {
    let elector: LeaderElector;
    const config: LeaderElectorConfig = {
        bucket: "test_bucket",
        key: "test_key",
        leaseDurationMs: 1000,
        heartbeatIntervalMs: 100, // Fast heartbeat for tests
        nodeId: "test-node",
    };

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        elector = new LeaderElector(config, mockNatsClient, mockLogger);
    });

    afterEach(async () => {
        await elector.stop();
        jest.useRealTimers();
    });

    it("should acquire lease if no leader exists", async () => {
        mockKv.get.mockResolvedValue(null);
        mockKv.create.mockResolvedValue(1); // Successful create

        await elector.start();

        expect(mockNatsClient.getJetStream).toHaveBeenCalled();
        expect(mockJs.views.kv).toHaveBeenCalledWith(
            "test_bucket",
            expect.anything(),
        );
        expect(mockKv.get).toHaveBeenCalledWith("test_key");
        expect(mockKv.create).toHaveBeenCalled();
        expect(elector.isLeader()).toBe(true);
        expect(mockLogger.info).toHaveBeenCalledWith(
            expect.stringContaining("Became LEADER"),
        );
    });

    it("should start as follower if leader exists", async () => {
        mockKv.get.mockResolvedValue({
            value: Buffer.from(
                JSON.stringify({ nodeId: "other-node", ts: Date.now() }),
            ),
            revision: 1,
        });

        await elector.start();

        expect(mockKv.get).toHaveBeenCalled();
        expect(mockKv.create).not.toHaveBeenCalled();
        expect(elector.isLeader()).toBe(false);
    });

    it("should renew lease periodically if leader", async () => {
        mockKv.get.mockResolvedValue(null);
        mockKv.create.mockResolvedValue(1);

        await elector.start(); // Becomes leader
        expect(elector.isLeader()).toBe(true);

        // Advance time to trigger heartbeat
        mockKv.put.mockResolvedValue(2);
        await jest.advanceTimersByTimeAsync(150);

        expect(mockKv.put).toHaveBeenCalledWith("test_key", expect.anything());
    });

    it("should try to acquire lease periodically if follower", async () => {
        // Initially follower
        mockKv.get.mockResolvedValue({
            value: Buffer.from(
                JSON.stringify({ nodeId: "other-node", ts: Date.now() }),
            ),
            revision: 1,
        });

        await elector.start();
        expect(elector.isLeader()).toBe(false);

        // Advance time - still follower, should check again
        // Next check, simulate leader is gone (returns null)
        mockKv.get.mockResolvedValueOnce(null);
        mockKv.create.mockResolvedValue(2);

        await jest.advanceTimersByTimeAsync(150);

        // Should have called get again
        expect(mockKv.get).toHaveBeenCalledTimes(2);
        // Should try to create
        expect(mockKv.create).toHaveBeenCalled();
        // Should become leader
        expect(elector.isLeader()).toBe(true);
    });

    it("should release lease on stop if leader", async () => {
        mockKv.get.mockResolvedValue(null);
        mockKv.create.mockResolvedValue(1);

        await elector.start();
        expect(elector.isLeader()).toBe(true);

        await elector.stop();

        expect(mockKv.delete).toHaveBeenCalledWith("test_key");
        expect(elector.isLeader()).toBe(false);
    });

    it("should demote if renewal fails", async () => {
        mockKv.get.mockResolvedValue(null);
        mockKv.create.mockResolvedValue(1);

        await elector.start();
        expect(elector.isLeader()).toBe(true);

        // Next renewal fails
        mockKv.put.mockRejectedValue(new Error("Storage failure"));

        await jest.advanceTimersByTimeAsync(150);

        expect(elector.isLeader()).toBe(false);
        expect(mockLogger.warn).toHaveBeenCalledWith(
            expect.stringContaining("Failed to renew lease"),
            undefined,
            expect.anything(),
        );
    });

    it("should resume leadership if it was already the leader (restart case)", async () => {
        // Simulate existing entry is US
        mockKv.get.mockResolvedValue({
            value: Buffer.from(
                JSON.stringify({ nodeId: "test-node", ts: Date.now() }),
            ),
            revision: 1,
        });

        await elector.start();

        expect(elector.isLeader()).toBe(true);
        // Should not try to create, just assumed leadership
        expect(mockKv.create).not.toHaveBeenCalled();
    });
});
