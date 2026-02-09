import { act, renderHook, waitFor } from "@/test/utils";
import { vi } from "vitest";
import { useTitanStream } from "../useTitanStream";

describe("useTitanStream", () => {
    let mockWebSocket: any;

    beforeEach(() => {
        mockWebSocket = {
            send: vi.fn(),
            close: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            onopen: null,
            onmessage: null,
            onclose: null,
            readyState: WebSocket.CONNECTING,
        };

        global.WebSocket = vi.fn(function () {
            return mockWebSocket;
        }) as any;

        // Mock localStorage
        Object.defineProperty(window, "localStorage", {
            value: {
                getItem: vi.fn(() => "mock-token"),
                setItem: vi.fn(),
                removeItem: vi.fn(),
            },
            writable: true,
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("should connect to WebSocket on mount", () => {
        renderHook(() => useTitanStream("TITAN_EVT"));
        expect(global.WebSocket).toHaveBeenCalledTimes(1);
    });

    it("should handle incoming messages", async () => {
        const { result } = renderHook(() => useTitanStream("TITAN_EVT"));

        // Simulate open
        await waitFor(() => {
            expect(mockWebSocket.onopen).toBeTruthy();
        });

        act(() => {
            mockWebSocket.onopen();
        });

        // Simulate message
        await waitFor(() => {
            expect(mockWebSocket.onmessage).toBeTruthy();
        });

        // Use 'payload' field to match hook logic which unwraps 'payload' if present
        const testPayload = { value: 123 };
        const testMessage = { subject: "test", payload: testPayload };

        act(() => {
            mockWebSocket.onmessage({ data: JSON.stringify(testMessage) });
        });

        await waitFor(() => {
            expect(result.current.lastMessage).toEqual({
                subject: "test",
                data: testPayload,
                timestamp: expect.any(Number),
            });
        });
    });

    it("should handle connection status updates", async () => {
        const { result } = renderHook(() => useTitanStream("TITAN_EVT"));
        expect(result.current.isConnected).toBe(false);

        await waitFor(() => {
            expect(mockWebSocket.onopen).toBeTruthy();
        });

        act(() => {
            mockWebSocket.onopen();
        });

        expect(result.current.isConnected).toBe(true);

        await waitFor(() => {
            expect(mockWebSocket.onclose).toBeTruthy();
        });

        act(() => {
            mockWebSocket.onclose();
        });

        expect(result.current.isConnected).toBe(false);
    });
});
