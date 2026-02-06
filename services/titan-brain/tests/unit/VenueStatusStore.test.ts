import { VenueStatusStore } from "../../src/services/venues/VenueStatusStore.js";
import { VenueId, type VenueStatusV1, VenueWsState } from "@titan/shared";

interface KvWatchEntry {
    key: string;
    value: Uint8Array;
    operation: "PUT" | "DEL" | "PURGE";
}

class AsyncQueue<T> implements AsyncIterable<T> {
    private readonly items: T[] = [];
    private done = false;
    private waiter: ((result: IteratorResult<T>) => void) | null = null;

    push(item: T): void {
        if (this.waiter) {
            const resolve = this.waiter;
            this.waiter = null;
            resolve({ value: item, done: false });
            return;
        }
        this.items.push(item);
    }

    close(): void {
        this.done = true;
        if (this.waiter) {
            const resolve = this.waiter;
            this.waiter = null;
            resolve({ value: undefined as T, done: true });
        }
    }

    [Symbol.asyncIterator](): AsyncIterator<T> {
        return {
            next: (): Promise<IteratorResult<T>> => {
                if (this.items.length > 0) {
                    const value = this.items.shift() as T;
                    return Promise.resolve({ value, done: false });
                }

                if (this.done) {
                    return Promise.resolve({ value: undefined as T, done: true });
                }

                return new Promise<IteratorResult<T>>((resolve) => {
                    this.waiter = resolve;
                });
            },
        };
    }
}

const flushAsync = async (): Promise<void> => {
    await Promise.resolve();
    await Promise.resolve();
};

const mockNats = {
    isConnected: jest.fn(),
    connect: jest.fn(),
    subscribe: jest.fn(),
    kvWatch: jest.fn(),
    kvKeys: jest.fn(),
    kvGet: jest.fn(),
};

jest.mock("@titan/shared", () => {
    const actual = jest.requireActual("@titan/shared");
    return {
        ...actual,
        getNatsClient: () => mockNats,
        safeParseVenueConfigV1: (data: unknown) => ({ success: true, data }),
    };
});

describe("VenueStatusStore Configurable Staleness", () => {
    let store: VenueStatusStore;
    let watchQueue: AsyncQueue<KvWatchEntry>;

    const now = new Date("2026-02-05T12:00:00Z");

    const createStatus = (): VenueStatusV1 => ({
        v: 1,
        ts: now.toISOString(),
        venue: VenueId.BINANCE,
        capabilities: {
            spot: true,
            perps: true,
            futures: false,
            options: false,
            enabled: true,
        },
        ws: {
            state: VenueWsState.CONNECTED,
            url: "wss://stream.binance.com",
            since_ts: now.toISOString(),
            last_msg_ts: now.toISOString(),
            last_trade_ts: null,
            ping_rtt_ms: 50,
            reconnects_15m: 0,
            parse_errors_5m: 0,
        },
        meta: { hunter_instance_id: "test", build_sha: "abc" },
    });

    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(now);

        watchQueue = new AsyncQueue<KvWatchEntry>();
        mockNats.isConnected.mockReturnValue(true);
        mockNats.kvWatch.mockResolvedValue(watchQueue);

        store = new VenueStatusStore({ staleThresholdMs: 5000 });
    });

    afterEach(() => {
        watchQueue.close();
        store.stop();
        jest.clearAllMocks();
        jest.useRealTimers();
    });

    it("should use default threshold when no config exists", () => {
        const status = createStatus();

        // Call private method to seed status cache for unit behavior checks.
        (store as unknown as { handleMessage: (data: unknown) => void })
            .handleMessage(status);

        const venueStatus = store.getVenueStatus(VenueId.BINANCE);
        expect(venueStatus).toBeDefined();
        expect(venueStatus?.effectiveThresholdMs).toBe(5000);
        expect(venueStatus?.isStale).toBe(false);

        jest.advanceTimersByTime(6000);

        const staleStatus = store.getVenueStatus(VenueId.BINANCE);
        expect(staleStatus?.isStale).toBe(true);
    });

    it("should apply custom threshold from KV config", async () => {
        await store.start();

        watchQueue.push({
            key: "config.venue.binance",
            value: new TextEncoder().encode(
                JSON.stringify({ staleness_threshold_ms: 10000 }),
            ),
            operation: "PUT",
        });
        await flushAsync();

        const status = createStatus();
        (store as unknown as { handleMessage: (data: unknown) => void })
            .handleMessage(status);

        const venueStatus = store.getVenueStatus(VenueId.BINANCE);
        expect(venueStatus?.effectiveThresholdMs).toBe(10000);

        jest.advanceTimersByTime(6000);
        const notStaleStatus = store.getVenueStatus(VenueId.BINANCE);
        expect(notStaleStatus?.isStale).toBe(false);

        jest.advanceTimersByTime(5000);
        const staleStatus = store.getVenueStatus(VenueId.BINANCE);
        expect(staleStatus?.isStale).toBe(true);
    });

    it("should revert to default if config is deleted", async () => {
        await store.start();

        watchQueue.push({
            key: "config.venue.binance",
            value: new TextEncoder().encode(
                JSON.stringify({ staleness_threshold_ms: 10000 }),
            ),
            operation: "PUT",
        });
        await flushAsync();

        const status = createStatus();
        (store as unknown as { handleMessage: (data: unknown) => void })
            .handleMessage(status);

        expect(store.getVenueStatus(VenueId.BINANCE)?.effectiveThresholdMs)
            .toBe(10000);

        watchQueue.push({
            key: "config.venue.binance",
            value: new Uint8Array(),
            operation: "DEL",
        });
        await flushAsync();

        expect(store.getVenueStatus(VenueId.BINANCE)?.effectiveThresholdMs)
            .toBe(5000);
    });
});
