import { EventStore } from "../../src/persistence/EventStore.js";
import { DatabaseManager } from "../../src/db/DatabaseManager.js";
import { EventType } from "../../src/events/EventTypes.js";
import { getNatsClient } from "@titan/shared";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

// Mock uuid to avoid ESM issues - return VALID UUID
jest.mock("uuid", () => ({
    v4: jest.fn(() => "00000000-0000-0000-0000-000000000000"),
}));
import { v4 as uuidv4 } from "uuid";

// Proper mocking of @titan/shared
jest.mock("@titan/shared", () => ({
    getNatsClient: jest.fn(),
    NatsClient: jest.fn(),
}));

// Mock Logger to avoid dependency issues
jest.mock("../../src/utils/Logger.js", () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
    },
}));

// Mock DatabaseManager
jest.mock("../../src/db/DatabaseManager.js", () => {
    return {
        DatabaseManager: jest.fn().mockImplementation(() => ({
            query: jest.fn(),
        })),
    };
});

describe("EventStore", () => {
    let eventStore: EventStore;
    let mockDb: { query: jest.Mock<(...args: any[]) => Promise<any>> };
    let mockNats: { publish: jest.Mock<(...args: any[]) => Promise<void>> };

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup Mock DB
        mockDb = {
            query: jest.fn<(...args: any[]) => Promise<any>>()
                .mockResolvedValue({ rows: [] }),
        };
        (DatabaseManager as unknown as jest.Mock).mockImplementation(() =>
            mockDb
        );

        // Setup Mock NATS
        mockNats = {
            publish: jest.fn<(...args: any[]) => Promise<void>>()
                .mockResolvedValue(undefined),
        };
        (getNatsClient as jest.Mock).mockReturnValue(mockNats);

        // Re-instantiate EventStore with the mocked DB
        eventStore = new EventStore(new DatabaseManager({} as any));
    });

    describe("append", () => {
        it("should persist event to DB and publish to NATS", async () => {
            const event = {
                id: "00000000-0000-0000-0000-000000000000",
                type: EventType.INTENT_CREATED,
                aggregateId: "signal-123",
                payload: { signal: "test" },
                metadata: {
                    traceId: "00000000-0000-0000-0000-000000000000",
                    version: 1,
                    timestamp: new Date(),
                },
            };

            // Mock DB query success
            mockDb.query.mockResolvedValueOnce({ rows: [] });

            await eventStore.append(event);

            // Verify DB insertion
            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining("INSERT INTO event_log"),
                expect.arrayContaining([
                    event.id,
                    event.type,
                    event.aggregateId,
                    expect.any(String), // payload stringified
                    expect.any(String), // metadata stringified
                    1,
                ]),
            );

            // Verify NATS publish
            expect(mockNats.publish).toHaveBeenCalledWith(
                "titan.events.intent_created",
                event,
            );
        });

        it("should throw error if event schema is invalid", async () => {
            const invalidEvent = {
                id: "not-a-uuid",
                type: "INVALID_TYPE",
                // missing other fields
            };

            await expect(eventStore.append(invalidEvent as any)).rejects
                .toThrow("Invalid event schema");
            expect(mockDb.query).not.toHaveBeenCalled();
            expect(mockNats.publish).not.toHaveBeenCalled();
        });

        it("should propagate DB errors", async () => {
            const event = {
                id: "00000000-0000-0000-0000-000000000000",
                type: EventType.INTENT_CREATED,
                aggregateId: "signal-123",
                payload: { signal: "test" },
                metadata: {
                    traceId: "00000000-0000-0000-0000-000000000000",
                    version: 1,
                    timestamp: new Date(),
                },
            };

            mockDb.query.mockRejectedValueOnce(
                new Error("DB Connection Failed"),
            );

            await expect(eventStore.append(event)).rejects.toThrow(
                "DB Connection Failed",
            );
            expect(mockNats.publish).not.toHaveBeenCalled();
        });
    });

    describe("getStream", () => {
        it("should retrieve events for aggregateId", async () => {
            const aggregateId = "agg-1";
            const mockRows = [
                {
                    id: "id-1",
                    type: "INTENT_CREATED",
                    aggregate_id: aggregateId,
                    payload: { data: 1 },
                    metadata: { version: 1 },
                    created_at: new Date(),
                },
            ];

            mockDb.query.mockResolvedValueOnce({ rows: mockRows });

            const events = await eventStore.getStream(aggregateId);

            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining(
                    "SELECT * FROM event_log WHERE aggregate_id",
                ),
                [aggregateId],
            );
            expect(events).toHaveLength(1);
            expect(events[0].id).toBe("id-1");
        });
    });
});
