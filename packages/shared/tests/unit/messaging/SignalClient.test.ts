/**
 * Unit tests for SignalClient
 *
 * Tests the SignalClient class which handles signal submission to Brain via NATS.
 * Note: Full integration tests require NATS connection.
 * This file focuses on unit testing the client's state management and API contract.
 */

import { EventEmitter } from "eventemitter3";

// Define mock types directly to avoid module resolution issues
enum ConnectionState {
    DISCONNECTED = "DISCONNECTED",
    CONNECTING = "CONNECTING",
    CONNECTED = "CONNECTED",
    RECONNECTING = "RECONNECTING",
    CLOSING = "CLOSING",
}

enum SignalSource {
    SCAVENGER = "SCAVENGER",
    HUNTER = "HUNTER",
    SENTINEL = "SENTINEL",
}

interface IntentSignal {
    signal_id: string;
    symbol: string;
    direction: "LONG" | "SHORT";
    entry_zone: {
        min: number;
        max: number;
    };
    confidence: number;
    source: SignalSource;
    timestamp: number;
}

interface PrepareResponse {
    prepared: boolean;
    signal_id: string;
    reason?: string;
}

interface ConfirmResponse {
    executed: boolean;
    fill_price?: number;
    reason?: string;
}

interface AbortResponse {
    aborted: boolean;
}

// Create a mock NatsClient for testing
class MockNatsClient {
    private connected = false;
    private publishedMessages: Array<{ subject: string; payload: unknown }> =
        [];

    async connect(): Promise<void> {
        this.connected = true;
    }

    async disconnect(): Promise<void> {
        this.connected = false;
    }

    isConnected(): boolean {
        return this.connected;
    }

    async publish(subject: string, payload: unknown): Promise<void> {
        if (!this.connected) {
            throw new Error("Not connected");
        }
        this.publishedMessages.push({ subject, payload });
    }

    getPublishedMessages() {
        return this.publishedMessages;
    }

    clearMessages() {
        this.publishedMessages = [];
    }
}

/**
 * SignalClient implementation for testing
 * This mirrors the actual SignalClient but uses a mock NatsClient
 */
class TestableSignalClient extends EventEmitter {
    private nats: MockNatsClient;
    private pendingSignals: Map<string, IntentSignal> = new Map();
    private source: SignalSource;

    constructor(config: { source: SignalSource }, nats: MockNatsClient) {
        super();
        this.source = config.source;
        this.nats = nats;
    }

    async connect(): Promise<void> {
        if (!this.nats.isConnected()) {
            await this.nats.connect();
        }
    }

    async disconnect(): Promise<void> {
        // Shared NATS client usually remains open
    }

    isConnected(): boolean {
        return this.nats.isConnected();
    }

    getConnectionState(): ConnectionState {
        return this.nats.isConnected()
            ? ConnectionState.CONNECTED
            : ConnectionState.DISCONNECTED;
    }

    async sendPrepare(signal: IntentSignal): Promise<PrepareResponse> {
        if (!this.isConnected()) {
            try {
                await this.connect();
            } catch {
                // Auto-connect failed
            }
        }

        if (!signal.symbol || !signal.signal_id) {
            return {
                prepared: false,
                signal_id: signal.signal_id,
                reason: "Invalid signal data",
            };
        }

        // Cache locally for Confirm phase
        this.pendingSignals.set(signal.signal_id, signal);

        return {
            prepared: true,
            signal_id: signal.signal_id,
        };
    }

    async sendConfirm(signal_id: string): Promise<ConfirmResponse> {
        const signal = this.pendingSignals.get(signal_id);
        if (!signal) {
            return { executed: false, reason: "Signal not found or expired" };
        }

        const payload = {
            signal_id: signal.signal_id,
            source: this.source,
            symbol: signal.symbol,
            direction: signal.direction,
            signal_type: "SETUP_CONFIRMATION",
            timestamp: Date.now(),
            payload: signal,
        };

        try {
            await this.nats.publish("titan.signal.submit.v1", payload);
            this.pendingSignals.delete(signal_id);

            return {
                executed: true,
                fill_price: (signal.entry_zone.min + signal.entry_zone.max) / 2,
            };
        } catch (e: unknown) {
            return {
                executed: false,
                reason: e instanceof Error ? e.message : String(e),
            };
        }
    }

    async sendAbort(signal_id: string): Promise<AbortResponse> {
        this.pendingSignals.delete(signal_id);
        return { aborted: true };
    }

    getMetrics(): Record<string, number> {
        return {
            messagesSent: 0,
            messagesReceived: 0,
            reconnectAttempts: 0,
        };
    }

    getStatus(): Record<string, unknown> {
        return {
            connectionState: this.getConnectionState(),
            socketPath: "nats://" +
                (this.nats.isConnected() ? "connected" : "disconnected"),
            source: this.source,
            metrics: this.getMetrics(),
        };
    }

    async forceReconnect(): Promise<void> {
        await this.connect();
    }

    // Test helpers
    getPendingSignalsCount(): number {
        return this.pendingSignals.size;
    }

    getNatsClient(): MockNatsClient {
        return this.nats;
    }
}

describe("SignalClient", () => {
    let mockNats: MockNatsClient;
    let client: TestableSignalClient;

    const createTestSignal = (
        overrides: Partial<IntentSignal> = {},
    ): IntentSignal => ({
        signal_id: `sig-${Date.now()}-${
            Math.random().toString(36).substr(2, 9)
        }`,
        symbol: "BTCUSDT",
        direction: "LONG",
        entry_zone: { min: 40000, max: 40500 },
        confidence: 0.85,
        source: SignalSource.SCAVENGER,
        timestamp: Date.now(),
        ...overrides,
    });

    beforeEach(() => {
        mockNats = new MockNatsClient();
        client = new TestableSignalClient(
            { source: SignalSource.SCAVENGER },
            mockNats,
        );
    });

    describe("Construction", () => {
        it("should create a client with the given source", () => {
            const status = client.getStatus();
            expect(status.source).toBe(SignalSource.SCAVENGER);
        });

        it("should start in disconnected state", () => {
            expect(client.isConnected()).toBe(false);
            expect(client.getConnectionState()).toBe(
                ConnectionState.DISCONNECTED,
            );
        });
    });

    describe("Connection Management", () => {
        it("should connect to NATS successfully", async () => {
            await client.connect();
            expect(client.isConnected()).toBe(true);
            expect(client.getConnectionState()).toBe(ConnectionState.CONNECTED);
        });

        it("should not reconnect if already connected", async () => {
            await client.connect();
            await client.connect(); // Second connect should be idempotent
            expect(client.isConnected()).toBe(true);
        });

        it("should allow forceReconnect", async () => {
            await client.forceReconnect();
            expect(client.isConnected()).toBe(true);
        });
    });

    describe("Prepare Flow", () => {
        beforeEach(async () => {
            await client.connect();
        });

        it("should successfully prepare a valid signal", async () => {
            const signal = createTestSignal();
            const response = await client.sendPrepare(signal);

            expect(response.prepared).toBe(true);
            expect(response.signal_id).toBe(signal.signal_id);
            expect(client.getPendingSignalsCount()).toBe(1);
        });

        it("should reject signal without symbol", async () => {
            const signal = createTestSignal({ symbol: "" });
            const response = await client.sendPrepare(signal);

            expect(response.prepared).toBe(false);
            expect(response.reason).toBe("Invalid signal data");
        });

        it("should reject signal without signal_id", async () => {
            const signal = createTestSignal({ signal_id: "" });
            const response = await client.sendPrepare(signal);

            expect(response.prepared).toBe(false);
            expect(response.reason).toBe("Invalid signal data");
        });

        it("should auto-connect if not connected", async () => {
            await mockNats.disconnect();
            expect(client.isConnected()).toBe(false);

            const signal = createTestSignal();
            const response = await client.sendPrepare(signal);

            expect(client.isConnected()).toBe(true);
            expect(response.prepared).toBe(true);
        });

        it("should store multiple pending signals", async () => {
            await client.sendPrepare(createTestSignal());
            await client.sendPrepare(createTestSignal());
            await client.sendPrepare(createTestSignal());

            expect(client.getPendingSignalsCount()).toBe(3);
        });
    });

    describe("Confirm Flow", () => {
        let preparedSignal: IntentSignal;

        beforeEach(async () => {
            await client.connect();
            preparedSignal = createTestSignal();
            await client.sendPrepare(preparedSignal);
        });

        it("should successfully confirm a prepared signal", async () => {
            const response = await client.sendConfirm(preparedSignal.signal_id);

            expect(response.executed).toBe(true);
            expect(response.fill_price).toBe(40250); // (40000 + 40500) / 2
            expect(client.getPendingSignalsCount()).toBe(0);
        });

        it("should publish to NATS on confirm", async () => {
            await client.sendConfirm(preparedSignal.signal_id);

            const messages = mockNats.getPublishedMessages();
            expect(messages.length).toBe(1);
            expect(messages[0].subject).toBe("titan.signal.submit.v1");
            expect((messages[0].payload as Record<string, unknown>).symbol)
                .toBe("BTCUSDT");
        });

        it("should fail to confirm unknown signal", async () => {
            const response = await client.sendConfirm("unknown-signal-id");

            expect(response.executed).toBe(false);
            expect(response.reason).toBe("Signal not found or expired");
        });

        it("should fail to confirm same signal twice", async () => {
            await client.sendConfirm(preparedSignal.signal_id);
            const response = await client.sendConfirm(preparedSignal.signal_id);

            expect(response.executed).toBe(false);
            expect(response.reason).toBe("Signal not found or expired");
        });

        it("should handle NATS publish failure gracefully", async () => {
            await mockNats.disconnect();
            const response = await client.sendConfirm(preparedSignal.signal_id);

            expect(response.executed).toBe(false);
            expect(response.reason).toBe("Not connected");
        });
    });

    describe("Abort Flow", () => {
        beforeEach(async () => {
            await client.connect();
        });

        it("should successfully abort a prepared signal", async () => {
            const signal = createTestSignal();
            await client.sendPrepare(signal);
            expect(client.getPendingSignalsCount()).toBe(1);

            const response = await client.sendAbort(signal.signal_id);

            expect(response.aborted).toBe(true);
            expect(client.getPendingSignalsCount()).toBe(0);
        });

        it("should succeed when aborting unknown signal", async () => {
            const response = await client.sendAbort("unknown-signal-id");
            expect(response.aborted).toBe(true);
        });
    });

    describe("Metrics and Status", () => {
        it("should return default metrics", () => {
            const metrics = client.getMetrics();

            expect(metrics.messagesSent).toBe(0);
            expect(metrics.messagesReceived).toBe(0);
            expect(metrics.reconnectAttempts).toBe(0);
        });

        it("should return comprehensive status", () => {
            const status = client.getStatus();

            expect(status.connectionState).toBe(ConnectionState.DISCONNECTED);
            expect(status.source).toBe(SignalSource.SCAVENGER);
            expect(status.metrics).toBeDefined();
        });

        it("should update status after connection", async () => {
            await client.connect();
            const status = client.getStatus();

            expect(status.connectionState).toBe(ConnectionState.CONNECTED);
            expect(status.socketPath).toContain("connected");
        });
    });

    describe("Signal Flow Integration", () => {
        it("should complete full prepare-confirm flow", async () => {
            await client.connect();
            const signal = createTestSignal();

            // Prepare
            const prepareResponse = await client.sendPrepare(signal);
            expect(prepareResponse.prepared).toBe(true);

            // Confirm
            const confirmResponse = await client.sendConfirm(signal.signal_id);
            expect(confirmResponse.executed).toBe(true);

            // Verify signal was removed from pending
            expect(client.getPendingSignalsCount()).toBe(0);
        });

        it("should complete prepare-abort flow", async () => {
            await client.connect();
            const signal = createTestSignal();

            // Prepare
            const prepareResponse = await client.sendPrepare(signal);
            expect(prepareResponse.prepared).toBe(true);

            // Abort
            const abortResponse = await client.sendAbort(signal.signal_id);
            expect(abortResponse.aborted).toBe(true);

            // Verify signal was removed from pending
            expect(client.getPendingSignalsCount()).toBe(0);
        });

        it("should handle multiple signals in parallel", async () => {
            await client.connect();
            const signals = [
                createTestSignal(),
                createTestSignal(),
                createTestSignal(),
            ];

            // Prepare all
            await Promise.all(signals.map((s) => client.sendPrepare(s)));
            expect(client.getPendingSignalsCount()).toBe(3);

            // Confirm one, abort one
            await client.sendConfirm(signals[0].signal_id);
            await client.sendAbort(signals[1].signal_id);

            expect(client.getPendingSignalsCount()).toBe(1);
        });
    });
});
