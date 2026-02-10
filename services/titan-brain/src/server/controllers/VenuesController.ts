/**
 * VenuesController - REST API for exchange connectivity and instruments
 *
 * Endpoints:
 * - GET /venues - Get all exchanges with status
 * - GET /venues/:exchange - Get specific exchange details
 * - GET /venues/:exchange/instruments - Get instruments for exchange
 * - POST /venues/:exchange/test - Test connectivity
 */
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Logger } from "../../logging/Logger.js";
import { AuthMiddleware } from "../../security/AuthMiddleware.js";
import { getVenueStatusStore } from "../../services/venues/VenueStatusStore.js";
import { VenueId, VenueWsState } from "@titan/shared";

/**
 * Feature flag: Use live venue telemetry from Hunter
 * Set VENUES_TELEMETRY_LIVE=true to enable
 */
const USE_LIVE_TELEMETRY = process.env.VENUES_TELEMETRY_LIVE === "true" ||
    process.env.VENUES_TELEMETRY_LIVE === "1";

/**
 * Mapping from exchange ID string to VenueId enum
 */
const EXCHANGE_ID_TO_VENUE: Record<string, VenueId> = {
    binance: VenueId.BINANCE,
    bybit: VenueId.BYBIT,
    coinbase: VenueId.COINBASE,
    kraken: VenueId.KRAKEN,
    mexc: VenueId.MEXC,

    deribit: VenueId.DERIBIT,
};

interface ExchangeStatus {
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

interface Instrument {
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

interface ShadowOrderRequest {
    symbol: string;
    side: "buy" | "sell";
    type: "market" | "limit";
    quantity: number;
    price?: number;
}

interface ShadowOrderResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    estimatedFill?: {
        price: number;
        quantity: number;
        fee: number;
        total: number;
    };
    riskChecks: {
        positionLimit: boolean;
        dailyLoss: boolean;
        concentration: boolean;
        volatility: boolean;
    };
}

export class VenuesController {
    private readonly logger: Logger;
    private readonly auth: AuthMiddleware;

    constructor(
        logger: Logger,
        auth: AuthMiddleware,
    ) {
        this.logger = logger;
        this.auth = auth;
    }

    /**
     * Register routes for this controller
     */
    registerRoutes(server: FastifyInstance): void {
        const operatorGuard = {
            preHandler: [this.auth.verifyToken.bind(this.auth)],
        };

        server.get(
            "/venues/summary",
            operatorGuard,
            this.handleGetSummary.bind(this),
        );
        server.get("/venues", operatorGuard, this.handleGetVenues.bind(this));
        server.get<{ Params: { exchange: string } }>(
            "/venues/:exchange",
            operatorGuard,
            this.handleGetVenue.bind(this),
        );
        server.get<
            {
                Params: { exchange: string };
                Querystring: { product?: string; search?: string };
            }
        >(
            "/venues/:exchange/instruments",
            operatorGuard,
            this.handleGetInstruments.bind(this),
        );
        server.post<{ Params: { exchange: string } }>(
            "/venues/:exchange/test",
            operatorGuard,
            this.handleTestConnectivity.bind(this),
        );
        server.post<{ Params: { exchange: string }; Body: ShadowOrderRequest }>(
            "/venues/:exchange/simulate",
            operatorGuard,
            this.handleShadowSimulate.bind(this),
        );
    }

    /**
     * GET /venues/summary - Get high-level venue connectivity summary
     */
    async handleGetSummary(
        _request: FastifyRequest,
        reply: FastifyReply,
    ): Promise<void> {
        try {
            const store = getVenueStatusStore();
            const summary = store.getSummary();

            reply.send({
                ...summary,
                source: store.hasData() ? "live" : "unknown",
                timestamp: Date.now(),
            });
        } catch (error) {
            this.logger.error("Failed to get venue summary", error as Error);
            reply.status(500).send({
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    }

    /**
     * GET /venues - Get all exchanges with connectivity status
     */
    async handleGetVenues(
        _request: FastifyRequest,
        reply: FastifyReply,
    ): Promise<void> {
        try {
            const exchanges = await this.getExchangeStatuses();

            reply.send({
                exchanges,
                count: exchanges.length,
                timestamp: Date.now(),
            });
        } catch (error) {
            this.logger.error("Failed to get venues", error as Error);
            reply.status(500).send({
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    }

    /**
     * GET /venues/:exchange - Get specific exchange details
     */
    async handleGetVenue(
        request: FastifyRequest<{ Params: { exchange: string } }>,
        reply: FastifyReply,
    ): Promise<void> {
        try {
            const { exchange } = request.params;
            const status = await this.getExchangeStatus(exchange);

            if (!status) {
                reply.status(404).send({
                    error: `Exchange not found: ${exchange}`,
                });
                return;
            }

            reply.send({
                exchange: status,
                timestamp: Date.now(),
            });
        } catch (error) {
            this.logger.error("Failed to get venue", error as Error);
            reply.status(500).send({
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    }

    /**
     * GET /venues/:exchange/instruments - Get instruments for exchange
     */
    async handleGetInstruments(
        request: FastifyRequest<
            {
                Params: { exchange: string };
                Querystring: { product?: string; search?: string };
            }
        >,
        reply: FastifyReply,
    ): Promise<void> {
        try {
            const { exchange } = request.params;
            const { product, search } = request.query;

            let instruments = await this.getInstruments(exchange);

            // Filter by product
            if (product && ["spot", "futures", "options"].includes(product)) {
                instruments = instruments.filter((i) => i.product === product);
            }

            // Filter by search term
            if (search) {
                const searchLower = search.toLowerCase();
                instruments = instruments.filter(
                    (i) =>
                        i.symbol.toLowerCase().includes(searchLower) ||
                        i.baseAsset.toLowerCase().includes(searchLower),
                );
            }

            reply.send({
                instruments,
                count: instruments.length,
                exchange,
                timestamp: Date.now(),
            });
        } catch (error) {
            this.logger.error("Failed to get instruments", error as Error);
            reply.status(500).send({
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    }

    /**
     * POST /venues/:exchange/test - Test connectivity to exchange
     */
    async handleTestConnectivity(
        request: FastifyRequest<{ Params: { exchange: string } }>,
        reply: FastifyReply,
    ): Promise<void> {
        try {
            const { exchange } = request.params;
            const result = await this.testExchangeConnectivity(exchange);

            reply.send({
                exchange,
                ...result,
                timestamp: Date.now(),
            });
        } catch (error) {
            this.logger.error("Connectivity test failed", error as Error);
            reply.status(500).send({
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    }

    /**
     * Get status of all configured exchanges
     */
    private async getExchangeStatuses(): Promise<ExchangeStatus[]> {
        // Supported exchanges from Titan configuration
        const supportedExchanges = [
            {
                id: "binance",
                name: "Binance",
                hasSpot: true,
                hasFutures: true,
                hasOptions: true,
            },
            {
                id: "bybit",
                name: "Bybit",
                hasSpot: true,
                hasFutures: true,
                hasOptions: true,
            },
            {
                id: "coinbase",
                name: "Coinbase",
                hasSpot: true,
                hasFutures: false,
                hasOptions: false,
            },
            {
                id: "kraken",
                name: "Kraken",
                hasSpot: true,
                hasFutures: true,
                hasOptions: false,
            },
            {
                id: "mexc",
                name: "MEXC",
                hasSpot: true,
                hasFutures: true,
                hasOptions: false,
            },

        ];

        const statuses: ExchangeStatus[] = [];

        for (const ex of supportedExchanges) {
            const status = await this.getExchangeStatus(ex.id);
            if (status) {
                statuses.push(status);
            } else {
                // Return offline status for unconfigured exchanges
                statuses.push({
                    id: ex.id,
                    name: ex.name,
                    connected: false,
                    products: {
                        spot: ex.hasSpot,
                        futures: ex.hasFutures,
                        options: ex.hasOptions,
                    },
                    rateLimit: { remaining: 0, limit: 0, resetAt: 0 },
                });
            }
        }

        return statuses;
    }

    /**
     * Get status of a specific exchange
     */
    private async getExchangeStatus(
        exchangeId: string,
    ): Promise<ExchangeStatus | null> {
        const exchangeInfo: Record<
            string,
            { name: string; spot: boolean; futures: boolean; options: boolean }
        > = {
            binance: {
                name: "Binance",
                spot: true,
                futures: true,
                options: true,
            },
            bybit: { name: "Bybit", spot: true, futures: true, options: true },
            coinbase: {
                name: "Coinbase",
                spot: true,
                futures: false,
                options: false,
            },
            kraken: {
                name: "Kraken",
                spot: true,
                futures: true,
                options: false,
            },
            mexc: { name: "MEXC", spot: true, futures: true, options: false },

        };

        const info = exchangeInfo[exchangeId];
        if (!info) return null;

        // Check if exchange is configured in environment
        const apiKeyEnv = `${exchangeId.toUpperCase()}_API_KEY`;
        const configured = !!process.env[apiKeyEnv];

        // Try live telemetry first if enabled
        if (USE_LIVE_TELEMETRY) {
            const liveStatus = this.getLiveExchangeStatus(exchangeId, info);
            if (liveStatus) {
                return liveStatus;
            }
            // Fall through to simulated if no live data
        }

        // @deprecated: Simulated fallback will be removed once live telemetry is stable
        // Enable live telemetry by setting VENUES_TELEMETRY_LIVE=true
        this.logger.warn(
            `Using simulated venue status for ${exchangeId} - enable VENUES_TELEMETRY_LIVE=true`,
            undefined,
            { exchangeId, useLiveTelemetry: USE_LIVE_TELEMETRY },
        );
        const connected = configured;
        const latency = connected
            ? Math.floor(Math.random() * 100) + 20
            : undefined;

        return {
            id: exchangeId,
            name: info.name,
            connected,
            latency,
            lastHeartbeat: connected
                ? Date.now() - Math.floor(Math.random() * 30000)
                : undefined,
            products: {
                spot: info.spot,
                futures: info.futures,
                options: info.options,
            },
            rateLimit: {
                remaining: connected
                    ? Math.floor(Math.random() * 1000) + 500
                    : 0,
                limit: 1200,
                resetAt: Date.now() + 60000,
            },
        };
    }

    /**
     * Get live exchange status from VenueStatusStore
     */
    private getLiveExchangeStatus(
        exchangeId: string,
        info: {
            name: string;
            spot: boolean;
            futures: boolean;
            options: boolean;
        },
    ): ExchangeStatus | null {
        const venueId = EXCHANGE_ID_TO_VENUE[exchangeId];
        if (!venueId) {
            return null;
        }

        const store = getVenueStatusStore();
        const cached = store.getVenueStatus(venueId);

        if (!cached) {
            return null; // No live data, caller will fallback
        }

        // Map VenueStatusV1 to ExchangeStatus
        const wsStatus = cached.status.ws;
        const connected = wsStatus.state === VenueWsState.CONNECTED;
        const degraded = wsStatus.state === VenueWsState.DEGRADED;

        return {
            id: exchangeId,
            name: info.name,
            connected: connected || degraded, // Degraded still counts as "connected" for backwards compat
            latency: wsStatus.ping_rtt_ms ?? undefined,
            lastHeartbeat: wsStatus.last_msg_ts
                ? new Date(wsStatus.last_msg_ts).getTime()
                : undefined,
            products: {
                spot: cached.status.capabilities.spot,
                futures: cached.status.capabilities.perps ||
                    cached.status.capabilities.futures,
                options: cached.status.capabilities.options,
            },
            rateLimit: {
                // Rate limit data not available from telemetry, use placeholder
                remaining: connected ? 1000 : 0,
                limit: 1200,
                resetAt: Date.now() + 60000,
            },
        };
    }

    /**
     * Get instruments for an exchange
     */
    private async getInstruments(exchangeId: string): Promise<Instrument[]> {
        // In production, this would fetch from exchange API or cache
        // For now, return sample data based on exchange
        const instruments: Instrument[] = [];

        const baseConfig = {
            binance: [
                "BTCUSDT",
                "ETHUSDT",
                "BNBUSDT",
                "SOLUSDT",
                "XRPUSDT",
                "DOGEUSDT",
                "ADAUSDT",
                "AVAXUSDT",
            ],
            bybit: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "LINKUSDT"],
            coinbase: ["BTC-USD", "ETH-USD", "SOL-USD", "AVAX-USD"],
            kraken: ["XBTUSD", "ETHUSD", "SOLUSD", "DOTUSD"],
            mexc: ["BTCUSDT", "ETHUSDT", "MXUSDT", "KASUSDT"],

        };

        const symbols = baseConfig[exchangeId as keyof typeof baseConfig] || [];

        for (const symbol of symbols) {
            // Extract base/quote from symbol
            let base = symbol;
            let quote = "USD";
            let product: "spot" | "futures" = "spot";

            if (symbol.includes("USDT")) {
                const parts = symbol.split("USDT");
                base = parts[0];
                quote = "USDT";
            } else if (symbol.includes("-USD")) {
                const parts = symbol.split("-USD");
                base = parts[0];
                quote = "USD";
            } else if (symbol.includes("USD")) {
                const parts = symbol.split("USD");
                base = parts[0];
                quote = "USD";
            } else if (symbol.includes("-PERP")) {
                base = symbol.replace("-PERP", "");
                quote = "USD";
                product = "futures";
            }

            instruments.push({
                symbol,
                baseAsset: base,
                quoteAsset: quote,
                product,
                status: "trading",
                minQty: 0.0001,
                maxQty: 1000,
                tickSize: 0.01,
                lotSize: 0.0001,
            });

            // Add futures variant if exchange supports it
            if (
                product === "spot" &&
                ["binance", "bybit", "mexc", "kraken"].includes(exchangeId)
            ) {
                instruments.push({
                    symbol: exchangeId === "kraken"
                        ? `${base}USD.P`
                        : `${base}USDT.P`,
                    baseAsset: base,
                    quoteAsset: quote,
                    product: "futures",
                    status: "trading",
                    minQty: 0.001,
                    maxQty: 100,
                    tickSize: 0.1,
                    lotSize: 0.001,
                });
            }
        }

        return instruments;
    }

    /**
     * Test connectivity to an exchange
     */
    private async testExchangeConnectivity(
        exchangeId: string,
    ): Promise<{ success: boolean; latency?: number; error?: string }> {
        const info = await this.getExchangeStatus(exchangeId);
        if (!info) {
            return { success: false, error: `Unknown exchange: ${exchangeId}` };
        }

        if (!info.connected) {
            return {
                success: false,
                error: "Exchange not configured (missing API credentials)",
            };
        }

        // In production, this would actually ping the exchange
        // Simulate a connectivity test with realistic latency
        const start = Date.now();
        await new Promise((resolve) =>
            setTimeout(resolve, Math.random() * 100 + 50)
        );
        const latency = Date.now() - start;

        return {
            success: true,
            latency,
        };
    }

    /**
     * POST /venues/:exchange/simulate - Shadow simulate an order
     * Validates order parameters and runs risk checks without execution
     */
    async handleShadowSimulate(
        request: FastifyRequest<
            { Params: { exchange: string }; Body: ShadowOrderRequest }
        >,
        reply: FastifyReply,
    ): Promise<void> {
        try {
            const { exchange } = request.params;
            const order = request.body;

            const result = await this.simulateOrder(exchange, order);

            reply.send({
                exchange,
                order,
                result,
                timestamp: Date.now(),
            });
        } catch (error) {
            this.logger.error("Shadow simulation failed", error as Error);
            reply.status(500).send({
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    }

    /**
     * Simulate order validation and risk checks
     */
    private async simulateOrder(
        exchangeId: string,
        order: ShadowOrderRequest,
    ): Promise<ShadowOrderResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Validate exchange exists
        const exchangeStatus = await this.getExchangeStatus(exchangeId);
        if (!exchangeStatus) {
            errors.push(`Unknown exchange: ${exchangeId}`);
        } else if (!exchangeStatus.connected) {
            errors.push(`Exchange ${exchangeId} is not connected`);
        }

        // Validate order parameters
        if (!order.symbol) {
            errors.push("Symbol is required");
        }
        if (!order.side || !["buy", "sell"].includes(order.side)) {
            errors.push("Side must be 'buy' or 'sell'");
        }
        if (!order.quantity || order.quantity <= 0) {
            errors.push("Quantity must be positive");
        }
        if (order.type === "limit" && !order.price) {
            errors.push("Limit orders require a price");
        }
        if (order.price && order.price <= 0) {
            errors.push("Price must be positive");
        }

        // Simulate risk checks
        const riskChecks = {
            positionLimit: true,
            dailyLoss: true,
            concentration: true,
            volatility: true,
        };

        // Check position limit (simulated)
        if (order.quantity > 10) {
            warnings.push(
                "Large position size - may trigger additional margin",
            );
            if (order.quantity > 50) {
                riskChecks.positionLimit = false;
                errors.push("Position size exceeds maximum allowed");
            }
        }

        // Check concentration risk (simulated)
        if (order.quantity > 25) {
            riskChecks.concentration = false;
            warnings.push("High concentration risk in single instrument");
        }

        // Estimate fill (simulated)
        const mockPrice = order.price || (Math.random() * 1000 + 40000); // Mock BTC-ish price
        const fee = mockPrice * order.quantity * 0.001; // 0.1% fee

        return {
            valid: errors.length === 0,
            errors,
            warnings,
            estimatedFill: errors.length === 0
                ? {
                    price: mockPrice,
                    quantity: order.quantity,
                    fee,
                    total: mockPrice * order.quantity +
                        (order.side === "buy" ? fee : -fee),
                }
                : undefined,
            riskChecks,
        };
    }
}
