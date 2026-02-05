import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderBookPublisher } from "../../src/telemetry/OrderBookPublisher";
import { TITAN_SUBJECTS, VenueId } from "@titan/shared";

const mockNats = {
    isConnected: vi.fn(),
    publish: vi.fn(),
};

vi.mock("@titan/shared", async () => {
    const actual = await vi.importActual("@titan/shared");
    return {
        ...actual,
        getNatsClient: () => mockNats,
        TITAN_SUBJECTS: {
            DATA: {
                VENUES: {
                    ORDERBOOKS: (venue: string, symbol: string) =>
                        `titan.data.venues.orderbooks.v1.${venue}.${symbol}`,
                },
            },
        },
    };
});

describe("OrderBookPublisher", () => {
    let publisher: OrderBookPublisher;

    beforeEach(() => {
        vi.useFakeTimers();
        mockNats.isConnected.mockReturnValue(true);
        // Reset singleton if possible or just create new instance logic validation
        // Since it's a singleton pattern in the file, we might need access to reset it or just rely on 'new'
        // The implementation exports class so we can instantiate directly for testing
        publisher = new OrderBookPublisher({
            enabled: true,
            flushIntervalMs: 100,
            maxBufferSize: 3,
            instanceId: "test-hunter",
        });
    });

    afterEach(() => {
        publisher.stop();
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    it("should buffer and flush deltas", async () => {
        publisher.start();

        publisher.publish(
            VenueId.BINANCE,
            "BTC/USDT",
            [["50000", "1"]],
            [["50001", "1"]],
            1,
            false,
        );

        publisher.publish(
            VenueId.BINANCE,
            "BTC/USDT",
            [["50000", "2"]], // Update bid
            [["50001", "1"]],
            2,
            false,
        );

        expect(publisher.getStats().buffer).toBe(2);
        expect(publisher.getStats().published).toBe(0);

        // Trigger flush
        await vi.advanceTimersByTimeAsync(100);

        expect(publisher.getStats().buffer).toBe(0);
        expect(publisher.getStats().published).toBe(2);

        expect(mockNats.publish).toHaveBeenCalledTimes(2);
        expect(mockNats.publish).toHaveBeenLastCalledWith(
            TITAN_SUBJECTS.DATA.VENUES.ORDERBOOKS(VenueId.BINANCE, "BTC_USDT"),
            expect.objectContaining({
                sequence: 2,
                bids: [["50000", "2"]],
            }),
        );
    });

    it("should drop items when buffer is full", async () => {
        publisher.start();

        // Max buffer is 3
        publisher.publish(VenueId.BINANCE, "BTC/USDT", [], [], 1, false);
        publisher.publish(VenueId.BINANCE, "BTC/USDT", [], [], 2, false);
        publisher.publish(VenueId.BINANCE, "BTC/USDT", [], [], 3, false);
        publisher.publish(VenueId.BINANCE, "BTC/USDT", [], [], 4, false); // Should drop oldest (seq 1)

        expect(publisher.getStats().buffer).toBe(3);
        expect(publisher.getStats().dropped).toBe(1);

        await vi.advanceTimersByTimeAsync(100);

        expect(mockNats.publish).toHaveBeenCalledTimes(3);
        // Validate seq 1 was dropped, so first published should be seq 2
        expect(mockNats.publish).toHaveBeenNthCalledWith(
            1,
            expect.any(String),
            expect.objectContaining({ sequence: 2 }),
        );
        expect(mockNats.publish).toHaveBeenLastCalledWith(
            expect.any(String),
            expect.objectContaining({ sequence: 4 }),
        );
    });
});
