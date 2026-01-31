/**
 * useVisualAnalysis Hook
 *
 * React hook for AI-powered visual chart analysis in titan-console.
 * Uses the SwarmOrchestrator's visual analysis capabilities via MoonViT.
 *
 * @module titan-console/hooks
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ============================================================================
// Types
// ============================================================================

export interface VisualAnalysisRequest {
    symbol: string;
    chartImageBase64?: string;
    chartImageUrl?: string;
    context?: string;
}

export interface VisualAnalysisSignal {
    type: "entry" | "exit" | "scale" | "hedge";
    direction: "long" | "short" | "neutral";
    strength: number;
    trigger: string;
}

export interface VisualAnalysisResult {
    symbol: string;
    trend: "bullish" | "bearish" | "neutral";
    trendStrength: number;
    patterns: string[];
    supports: number[];
    resistances: number[];
    signals: VisualAnalysisSignal[];
    reasoning: string;
    confidence: number;
    timestamp: number;
}

export interface UseVisualAnalysisOptions {
    /** BFF endpoint for visual analysis */
    endpoint?: string;
    /** Auto-analyze on mount */
    autoAnalyze?: boolean;
    /** Enable caching */
    cacheResults?: boolean;
    /** Cache TTL in ms */
    cacheTtlMs?: number;
}

export interface UseVisualAnalysisReturn {
    /** Trigger analysis */
    analyze: (
        request: VisualAnalysisRequest,
    ) => Promise<VisualAnalysisResult | null>;
    /** Last analysis result */
    result: VisualAnalysisResult | null;
    /** Loading state */
    isLoading: boolean;
    /** Error state */
    error: string | null;
    /** Clear result */
    clearResult: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_ENDPOINT = "/api/ai/visual-analysis";
const DEFAULT_CACHE_TTL_MS = 60_000; // 1 minute

// ============================================================================
// Hook Implementation
// ============================================================================

export function useVisualAnalysis(
    options: UseVisualAnalysisOptions = {},
): UseVisualAnalysisReturn {
    const {
        endpoint = DEFAULT_ENDPOINT,
        cacheResults = true,
        cacheTtlMs = DEFAULT_CACHE_TTL_MS,
    } = options;

    const [result, setResult] = useState<VisualAnalysisResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Cache ref
    const cacheRef = useRef<
        Map<string, { result: VisualAnalysisResult; expiry: number }>
    >(new Map());

    // Cleanup expired cache entries
    useEffect(() => {
        const interval = setInterval(() => {
            const now = Date.now();
            for (const [key, entry] of cacheRef.current) {
                if (entry.expiry < now) {
                    cacheRef.current.delete(key);
                }
            }
        }, 30_000);

        return () => clearInterval(interval);
    }, []);

    const getCacheKey = useCallback((req: VisualAnalysisRequest): string => {
        return `${req.symbol}:${req.chartImageUrl || "base64"}:${
            req.context || ""
        }`;
    }, []);

    const analyze = useCallback(
        async (
            request: VisualAnalysisRequest,
        ): Promise<VisualAnalysisResult | null> => {
            setError(null);

            // Check cache
            const cacheKey = getCacheKey(request);
            if (cacheResults) {
                const cached = cacheRef.current.get(cacheKey);
                if (cached && cached.expiry > Date.now()) {
                    setResult(cached.result);
                    return cached.result;
                }
            }

            // Validate request
            if (!request.chartImageBase64 && !request.chartImageUrl) {
                setError(
                    "Either chartImageBase64 or chartImageUrl is required",
                );
                return null;
            }

            setIsLoading(true);

            try {
                const response = await fetch(endpoint, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        symbol: request.symbol,
                        image: request.chartImageBase64 ||
                            request.chartImageUrl,
                        context: request.context,
                    }),
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(
                        `Analysis failed: ${response.status} - ${errorText}`,
                    );
                }

                const data = await response.json();

                const analysisResult: VisualAnalysisResult = {
                    symbol: request.symbol,
                    trend: data.trend || "neutral",
                    trendStrength: data.strength || data.trendStrength || 0.5,
                    patterns: data.patterns || [],
                    supports: data.supports || [],
                    resistances: data.resistances || [],
                    signals: (data.signals || []).map(
                        (
                            s: {
                                type: string;
                                direction: string;
                                strength?: number;
                                trigger: string;
                            },
                        ) => ({
                            type: s.type as
                                | "entry"
                                | "exit"
                                | "scale"
                                | "hedge",
                            direction: s.direction as
                                | "long"
                                | "short"
                                | "neutral",
                            strength: s.strength ?? 0.5,
                            trigger: s.trigger,
                        }),
                    ),
                    reasoning: data.reasoning || "",
                    confidence: data.confidence ?? 0.5,
                    timestamp: Date.now(),
                };

                // Cache result
                if (cacheResults) {
                    cacheRef.current.set(cacheKey, {
                        result: analysisResult,
                        expiry: Date.now() + cacheTtlMs,
                    });
                }

                setResult(analysisResult);
                return analysisResult;
            } catch (err) {
                const errorMessage = err instanceof Error
                    ? err.message
                    : "Unknown error";
                setError(errorMessage);
                return null;
            } finally {
                setIsLoading(false);
            }
        },
        [endpoint, cacheResults, cacheTtlMs, getCacheKey],
    );

    const clearResult = useCallback(() => {
        setResult(null);
        setError(null);
    }, []);

    return {
        analyze,
        result,
        isLoading,
        error,
        clearResult,
    };
}

// ============================================================================
// Utility: Convert Chart Element to Base64
// ============================================================================

export async function captureChartAsBase64(
    chartElement: HTMLElement,
    options: { quality?: number; format?: "png" | "jpeg" | "webp" } = {},
): Promise<string> {
    const { quality = 0.9, format = "png" } = options;

    // Dynamic import - html2canvas is an optional peer dependency
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let html2canvas: any;
    try {
        html2canvas = (await import("html2canvas")).default;
    } catch {
        throw new Error(
            "html2canvas is required for captureChartAsBase64. " +
                "Install with: npm install html2canvas",
        );
    }

    const canvas = await html2canvas(chartElement, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#1a1a2e",
        scale: 2,
    });

    return canvas.toDataURL(`image/${format}`, quality);
}
