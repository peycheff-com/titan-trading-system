import { useCallback, useState } from "react";
import { toast } from "sonner";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8080";

interface ApiOptions {
    method?: "GET" | "POST" | "DELETE" | "PUT";
    body?: any;
}

export function useTitanData() {
    const [loading, setLoading] = useState(false);

    const request = useCallback(
        async (endpoint: string, options: ApiOptions = {}) => {
            setLoading(true);
            try {
                const headers: HeadersInit = {
                    "Content-Type": "application/json",
                };

                const response = await fetch(`${API_BASE}${endpoint}`, {
                    method: options.method || "GET",
                    headers,
                    body: options.body
                        ? JSON.stringify(options.body)
                        : undefined,
                });

                if (!response.ok) {
                    throw new Error(`API Error: ${response.statusText}`);
                }

                const data = await response.json();
                return data;
            } catch (error) {
                console.error("API Request Failed:", error);
                toast.error(
                    error instanceof Error ? error.message : "Request failed",
                );
                throw error;
            } finally {
                setLoading(false);
            }
        },
        [],
    );

    const getSystemStatus = useCallback(
        () => request("/api/console/system-status"),
        [request],
    );

    const toggleMasterArm = useCallback(
        (enabled: boolean) =>
            request("/api/console/master-arm", {
                method: "POST",
                body: { enabled, operator_id: "console_user" },
            }),
        [request],
    );

    const flattenAll = useCallback(() =>
        request("/api/console/flatten-all", {
            method: "POST",
            body: { operator_id: "console_user" },
        }), [request]);

    const cancelAll = useCallback(() =>
        request("/api/console/cancel-all", {
            method: "POST",
            body: { operator_id: "console_user" },
        }), [request]);

    return {
        loading,
        request,
        getSystemStatus,
        toggleMasterArm,
        flattenAll,
        cancelAll,
    };
}
