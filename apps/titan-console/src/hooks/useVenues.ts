/**
 * useVenues Hook - React hooks for venue and exchange management
 */
import { useCallback, useEffect, useState } from "react";
import { getTitanBrainUrl } from "@/lib/api-config";
import { useAuth } from "@/context/AuthContext";

export interface ExchangeStatus {
    id: string;
    name: string;
    connected: boolean;
    latency?: number;
    lastHeartbeat?: number;
    products: {
        spot: boolean;
        futures: boolean;
        options: boolean;
    };
    rateLimit: {
        remaining: number;
        limit: number;
        resetAt: number;
    };
}

export interface Instrument {
    symbol: string;
    baseAsset: string;
    quoteAsset: string;
    product: "spot" | "futures" | "options";
    status: "trading" | "suspended" | "halted";
    minQty: number;
    maxQty: number;
    tickSize: number;
    lotSize: number;
}

interface VenuesResponse {
    exchanges: ExchangeStatus[];
    count: number;
    timestamp: number;
}

interface InstrumentsResponse {
    instruments: Instrument[];
    count: number;
    exchange: string;
    timestamp: number;
}

interface TestResponse {
    exchange: string;
    success: boolean;
    latency?: number;
    error?: string;
    timestamp: number;
}

// Hook for fetching all venues/exchanges
export function useVenues() {
    const { token } = useAuth();
    const [exchanges, setExchanges] = useState<ExchangeStatus[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchVenues = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch(`${getTitanBrainUrl()}/venues`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            if (!res.ok) throw new Error("Failed to fetch venues");
            const data: VenuesResponse = await res.json();
            setExchanges(data.exchanges);
            setError(null);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        if (token) fetchVenues();
    }, [token, fetchVenues]);

    return { exchanges, loading, error, refetch: fetchVenues };
}

// Hook for fetching instruments for a specific exchange
export function useInstruments(exchangeId: string, product?: string) {
    const { token } = useAuth();
    const [instruments, setInstruments] = useState<Instrument[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchInstruments = useCallback(async () => {
        if (!exchangeId) return;

        try {
            setLoading(true);
            const params = new URLSearchParams();
            if (product) params.set("product", product);

            const url =
                `${getTitanBrainUrl()}/venues/${exchangeId}/instruments?${params}`;
            const res = await fetch(url, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            if (!res.ok) throw new Error("Failed to fetch instruments");
            const data: InstrumentsResponse = await res.json();
            setInstruments(data.instruments);
            setError(null);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [token, exchangeId, product]);

    useEffect(() => {
        if (token && exchangeId) fetchInstruments();
    }, [token, exchangeId, product, fetchInstruments]);

    return { instruments, loading, error, refetch: fetchInstruments };
}

// Hook for testing connectivity to an exchange
export function useConnectivityTest() {
    const { token } = useAuth();
    const [testing, setTesting] = useState(false);
    const [result, setResult] = useState<TestResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    const testConnectivity = useCallback(async (exchangeId: string) => {
        try {
            setTesting(true);
            setError(null);
            setResult(null);

            const res = await fetch(
                `${getTitanBrainUrl()}/venues/${exchangeId}/test`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                },
            );

            const data: TestResponse = await res.json();
            setResult(data);

            if (!data.success) {
                setError(data.error || "Connectivity test failed");
            }

            return data;
        } catch (e) {
            const errorMsg = (e as Error).message;
            setError(errorMsg);
            return {
                exchange: exchangeId,
                success: false,
                error: errorMsg,
                timestamp: Date.now(),
            };
        } finally {
            setTesting(false);
        }
    }, [token]);

    return { testConnectivity, testing, result, error };
}
