import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export type ConnectionStatus =
    | "CONNECTING"
    | "CONNECTED"
    | "DISCONNECTED"
    | "RECONNECTING";

interface WebSocketOptions {
    url?: string;
    onMessage?: (data: any) => void;
    reconnectInterval?: number;
    maxRetries?: number;
}

export function useWebSocket({
    url = import.meta.env.VITE_WS_URL || "ws://localhost:8080",
    onMessage,
    reconnectInterval = 3000,
    maxRetries = 10,
}: WebSocketOptions = {}) {
    const [status, setStatus] = useState<ConnectionStatus>("DISCONNECTED");
    const [error, setError] = useState<Error | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectCountRef = useRef(0);
    const reconnectTimerRef = useRef<NodeJS.Timeout>();

    const connect = useCallback(() => {
        try {
            const fullUrl = `${url}/ws/console`;
            console.log("Connecting to WebSocket:", fullUrl);
            setStatus("CONNECTING");

            const ws = new WebSocket(fullUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                console.log("WebSocket Connected");
                setStatus("CONNECTED");
                reconnectCountRef.current = 0;
                setError(null);
                toast.success("Connected to Titan Core");
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    onMessage?.(data);
                } catch (e) {
                    console.error("Failed to parse WebSocket message:", e);
                }
            };

            ws.onclose = (event) => {
                console.log(
                    "WebSocket Disconnected:",
                    event.code,
                    event.reason,
                );
                setStatus("DISCONNECTED");
                wsRef.current = null;

                if (reconnectCountRef.current < maxRetries) {
                    setStatus("RECONNECTING");
                    reconnectTimerRef.current = setTimeout(() => {
                        reconnectCountRef.current += 1;
                        connect();
                    }, reconnectInterval);
                } else {
                    setError(new Error("Max reconnection attempts reached"));
                    toast.error("Connection lost. Please refresh.");
                }
            };

            ws.onerror = (event) => {
                console.error("WebSocket Error:", event);
                setError(new Error("WebSocket connection error"));
            };
        } catch (e) {
            console.error("WebSocket Connection Failed:", e);
            setStatus("DISCONNECTED");
            setError(e instanceof Error ? e : new Error("Unknown error"));
        }
    }, [url, onMessage, reconnectInterval, maxRetries]);

    useEffect(() => {
        connect();

        return () => {
            if (wsRef.current) {
                wsRef.current.close();
            }
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
            }
        };
    }, [connect]);

    const sendMessage = useCallback((data: any) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(data));
        } else {
            console.warn("WebSocket not connected, cannot send message");
            toast.error("Not connected to backend");
        }
    }, []);

    return { status, error, sendMessage };
}
