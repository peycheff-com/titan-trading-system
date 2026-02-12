/**
 * useConfig Hook - React hooks for configuration management
 *
 * Provides:
 * - Catalog fetching with category grouping
 * - Effective value resolution with provenance
 * - Override creation with tighten-only enforcement
 * - Rollback and receipt fetching
 */
import { useCallback, useEffect, useState } from "react";
import { getTitanBrainUrl } from "@/lib/api-config";
import { useAuth } from "@/context/AuthContext";

import { useThrottledState } from "./useThrottledState";

// Types from ConfigRegistry
export type ConfigSafety =
    | "immutable"
    | "tighten_only"
    | "raise_only"
    | "append_only"
    | "tunable";
export type ConfigScope = "global" | "venue" | "symbol" | "phase" | "operator";
export type ConfigStorage = "env" | "file" | "postgres" | "nats_kv";
export type ConfigApply = "live" | "restart" | "deploy";
export type ConfigWidget =
    | "slider"
    | "input"
    | "toggle"
    | "select"
    | "secret"
    | "tag_list"
    | "json_editor"
    | "big_button"
    | "readonly";

export interface ConfigSchema {
    type: "string" | "number" | "boolean" | "array" | "object";
    min?: number;
    max?: number;
    secret?: boolean;
    format?: string;
    items?: { type: string };
    enum?: string[];
}

export interface ConfigItem {
    key: string;
    title: string;
    description: string;
    category: string;
    safety: ConfigSafety;
    scope: ConfigScope;
    owner: string;
    storage: ConfigStorage;
    apply: ConfigApply;
    schema: ConfigSchema;
    widget: ConfigWidget;
    riskDirection?: "higher_is_riskier" | "lower_is_riskier";
    defaultValue?: unknown;
}

export interface ConfigProvenance {
    source: "default" | "env" | "file" | "override" | "deploy";
    value: unknown;
    timestamp: number;
    operatorId?: string;
    expiresAt?: number;
}

export interface EffectiveConfig {
    key: string;
    value: unknown;
    provenance: ConfigProvenance[];
}

export interface ConfigReceipt {
    id: string;
    key: string;
    previousValue: unknown;
    newValue: unknown;
    operatorId: string;
    reason: string;
    action: "override" | "rollback" | "propose";
    expiresAt?: number;
    timestamp: number;
    signature: string;
}

export interface ConfigOverride {
    id: string;
    key: string;
    value: unknown;
    previousValue: unknown;
    operatorId: string;
    reason: string;
    expiresAt?: number;
    createdAt: number;
    active: boolean;
}

interface CatalogResponse {
    items: ConfigItem[];
    grouped: Record<string, ConfigItem[]>;
    count: number;
    timestamp: number;
}

interface EffectiveResponse {
    configs: EffectiveConfig[];
    count: number;
    timestamp: number;
}

interface OverridesResponse {
    overrides: ConfigOverride[];
    count: number;
    timestamp: number;
}

interface ReceiptsResponse {
    receipts: ConfigReceipt[];
    count: number;
    timestamp: number;
}

// Hook for fetching config catalog
export function useConfigCatalog() {
    const { token } = useAuth();
    const [catalog, setCatalog] = useThrottledState<ConfigItem[]>([], 50);
    const [grouped, setGrouped] = useThrottledState<Record<string, ConfigItem[]>>({}, 50);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchCatalog = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch(`${getTitanBrainUrl()}/config/catalog`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            if (!res.ok) throw new Error("Failed to fetch catalog");
            const data: CatalogResponse = await res.json();
            setCatalog(data.items);
            setGrouped(data.grouped);
            setError(null);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [token, setCatalog, setGrouped]);

    useEffect(() => {
        if (token) fetchCatalog();
    }, [token, fetchCatalog]);

    return { catalog, grouped, loading, error, refetch: fetchCatalog };
}

// Hook for fetching effective configurations
export function useEffectiveConfig() {
    const { token } = useAuth();
    const [configs, setConfigs] = useThrottledState<EffectiveConfig[]>([], 50);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchEffective = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch(`${getTitanBrainUrl()}/config/effective`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            if (!res.ok) throw new Error("Failed to fetch effective config");
            const data: EffectiveResponse = await res.json();
            setConfigs(data.configs);
            setError(null);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [token, setConfigs]);

    useEffect(() => {
        if (token) fetchEffective();
    }, [token, fetchEffective]);

    return { configs, loading, error, refetch: fetchEffective };
}

// Hook for managing overrides
export function useConfigOverrides() {
    const { token } = useAuth();
    const [overrides, setOverrides] = useThrottledState<ConfigOverride[]>([], 50);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchOverrides = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch(`${getTitanBrainUrl()}/config/overrides`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            if (!res.ok) throw new Error("Failed to fetch overrides");
            const data: OverridesResponse = await res.json();
            setOverrides(data.overrides);
            setError(null);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [token, setOverrides]);

    const createOverride = useCallback(async (
        key: string,
        value: unknown,
        reason: string,
        expiresInHours?: number,
    ): Promise<
        { success: boolean; receipt?: ConfigReceipt; error?: string }
    > => {
        try {
            const res = await fetch(`${getTitanBrainUrl()}/config/override`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ key, value, reason, expiresInHours }),
            });
            const data = await res.json();
            if (!res.ok) {
                return {
                    success: false,
                    error: data.error || "Failed to create override",
                };
            }
            await fetchOverrides();
            return { success: true, receipt: data.receipt };
        } catch (e) {
            return { success: false, error: (e as Error).message };
        }
    }, [token, fetchOverrides]);

    const rollbackOverride = useCallback(
        async (key: string): Promise<{ success: boolean; error?: string }> => {
            try {
                const res = await fetch(
                    `${getTitanBrainUrl()}/config/override`,
                    {
                        method: "DELETE",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({ key }),
                    },
                );
                const data = await res.json();
                if (!res.ok) {
                    return {
                        success: false,
                        error: data.error || "Failed to rollback",
                    };
                }
                await fetchOverrides();
                return { success: true };
            } catch (e) {
                return { success: false, error: (e as Error).message };
            }
        },
        [token, fetchOverrides],
    );

    useEffect(() => {
        if (token) fetchOverrides();
    }, [token, fetchOverrides]);

    return {
        overrides,
        loading,
        error,
        createOverride,
        rollbackOverride,
        refetch: fetchOverrides,
    };
}

// Hook for fetching receipts
export function useConfigReceipts(limit = 50) {
    const { token } = useAuth();
    const [receipts, setReceipts] = useThrottledState<ConfigReceipt[]>([], 50);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchReceipts = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch(
                `${getTitanBrainUrl()}/config/receipts?limit=${limit}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                },
            );
            if (!res.ok) throw new Error("Failed to fetch receipts");
            const data: ReceiptsResponse = await res.json();
            setReceipts(data.receipts);
            setError(null);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [token, limit, setReceipts]);

    useEffect(() => {
        if (token) fetchReceipts();
    }, [token, fetchReceipts]);

    return { receipts, loading, error, refetch: fetchReceipts };
}

// SSE stream data type
interface ConfigStreamData {
    type: "init" | "update" | "heartbeat";
    overrides?: ConfigOverride[];
    receipts?: ConfigReceipt[];
    timestamp: number;
}

// Hook for real-time config updates via SSE
export function useConfigStream(onUpdate?: (data: ConfigStreamData) => void) {
    const { token } = useAuth();
    const [connected, setConnected] = useState(false);
    const [lastUpdate, setLastUpdate] = useState<number>(0);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!token) return;

        let eventSource: EventSource | null = null;

        const connect = () => {
            // Note: EventSource doesn't support custom headers natively
            // In production, you'd use a library like @microsoft/fetch-event-source
            // For now, we'll use a workaround with token in query string
            const url = `${getTitanBrainUrl()}/config/stream?token=${
                encodeURIComponent(token)
            }`;

            eventSource = new EventSource(url);

            eventSource.onopen = () => {
                setConnected(true);
                setError(null);
            };

            eventSource.onmessage = (event) => {
                try {
                    const data: ConfigStreamData = JSON.parse(event.data);
                    setLastUpdate(data.timestamp);

                    if (onUpdate && data.type !== "heartbeat") {
                        onUpdate(data);
                    }
                } catch (e) {
                    console.error("Failed to parse SSE data:", e);
                }
            };

            eventSource.onerror = () => {
                setConnected(false);
                setError("Connection lost, reconnecting...");
                eventSource?.close();
                // Reconnect after 5 seconds
                setTimeout(connect, 5000);
            };
        };

        connect();

        return () => {
            eventSource?.close();
        };
    }, [token, onUpdate]);

    return { connected, lastUpdate, error };
}
