import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getTitanExecutionUrl } from "@/lib/api-config";

// Type definitions
// ... (rest of imports/types)
export interface ScavengerTrap {
    symbol: string;
    trapType: string;
    triggerPrice: number;
    currentPrice: number;
    proximity: number; // Percent distance
    direction: "LONG" | "SHORT";
    confidence: number;
    volatilityRegime?: string;
    lastUpdated: number;
}

export interface SensorStatus {
    binanceHealth: "OK" | "DOWN" | "UNKNOWN";
    binanceTickRate: number;
    bybitStatus: "ARMED" | "DOWN" | "UNKNOWN";
    bybitPing: number;
    slippage: number;
}

interface ScavengerState {
    isConnected: boolean;
    trapMap: ScavengerTrap[];
    sensorStatus: SensorStatus;
    lastEvent: string | null;
}

// Sound effects (using standard browser Audio)
// In a real app, these would be assets, but we'll synthesize them for now or use placeholders
const playTrapSprungSound = () => {
    try {
        const audioContext =
            new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.type = "sawtooth";
        oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // A4
        oscillator.frequency.exponentialRampToValueAtTime(
            880,
            audioContext.currentTime + 0.1,
        ); // Slide up to A5

        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(
            0.01,
            audioContext.currentTime + 0.3,
        );

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.3);
    } catch (e) {
        console.warn("Audio playback failed", e);
    }
};

export function useScavengerSocket() {
    const [state, setState] = useState<ScavengerState>({
        isConnected: false,
        trapMap: [],
        sensorStatus: {
            binanceHealth: "UNKNOWN",
            binanceTickRate: 0,
            bybitStatus: "UNKNOWN",
            bybitPing: 0,
            slippage: 0,
        },
        lastEvent: null,
    });

    const socketRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

    const connect = useCallback(() => {
        try {
            // Connect to Titan Execution Service which proxies Scavenger WS
            const baseUrl = getTitanExecutionUrl();
            const wsUrl = baseUrl.replace(/^http/, "ws") + "/ws/scavenger";
            console.log("Connecting to Scavenger WS:", wsUrl);

            const ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                console.log("✅ Scavenger WS Connected");
                setState((prev) => ({ ...prev, isConnected: true }));

                // Request initial state
                ws.send(JSON.stringify({ type: "request_state" }));
            };

            ws.onclose = () => {
                console.log("🔌 Scavenger WS Disconnected");
                setState((prev) => ({ ...prev, isConnected: false }));
                socketRef.current = null;

                // Auto-reconnect after 3s
                reconnectTimeoutRef.current = setTimeout(connect, 3000);
            };

            ws.onerror = (error) => {
                console.warn("⚠️ Scavenger WS Error:", error);
            };

            ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);

                    switch (message.type) {
                        case "trap_map_updated":
                            // Batch update trap map
                            if (
                                message.data &&
                                Array.isArray(message.data.tripwires)
                            ) {
                                setState((prev) => ({
                                    ...prev,
                                    trapMap: message.data.tripwires,
                                }));
                            }
                            break;

                        case "sensor_status_updated":
                            if (message.data) {
                                setState((prev) => ({
                                    ...prev,
                                    sensorStatus: message.data,
                                }));
                            }
                            break;

                        case "trap_sprung":
                            // Play sound and show toast
                            console.log("⚡ TRAP SPRUNG:", message.data);
                            playTrapSprungSound();
                            toast.success(
                                `🪤 TRAAP! ${message.data.symbol} ${message.data.trapType} @ ${message.data.triggerPrice}`,
                            );

                            setState((prev) => ({
                                ...prev,
                                lastEvent: `${message.data.symbol} SPRUNG`,
                            }));
                            break;

                        default:
                            // Handle other messages
                            break;
                    }
                } catch (e) {
                    console.error("Failed to parse WS message", e);
                }
            };

            socketRef.current = ws;
        } catch (error) {
            console.error("WS Connection failed", error);
            reconnectTimeoutRef.current = setTimeout(connect, 3000);
        }
    }, []);

    // Initial connection
    useEffect(() => {
        connect();

        return () => {
            if (socketRef.current) {
                socketRef.current.close();
            }
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
        };
    }, [connect]);

    return state;
}
