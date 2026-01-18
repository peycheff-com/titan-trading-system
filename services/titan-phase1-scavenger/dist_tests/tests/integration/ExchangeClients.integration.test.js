/**
 * Integration Tests for Exchange Clients
 *
 * Tests the exchange clients with mock WebSocket and REST API responses.
 * These tests verify:
 * - Binance WebSocket subscription and reconnection
 * - Bybit order placement (with mock testnet)
 * - MEXC order placement (with mock testnet)
 * - ExchangeGateway parallel execution
 *
 * Requirements: 5-8 (Exchange Clients)
 *
 * NOTE: These tests use mocks to avoid hitting real exchange APIs.
 * For real testnet testing, set environment variables:
 * - BYBIT_TESTNET_API_KEY
 * - BYBIT_TESTNET_API_SECRET
 * - MEXC_TESTNET_API_KEY
 * - MEXC_TESTNET_API_SECRET
 */
import { BinanceSpotClient } from '../../src/exchanges/BinanceSpotClient';
import { BybitPerpsClient } from '../../src/exchanges/BybitPerpsClient';
import { MEXCPerpsClient } from '../../src/exchanges/MEXCPerpsClient';
import { ExchangeGateway } from '../../src/exchanges/ExchangeGateway';
import WebSocket, { WebSocketServer } from 'ws';
// Mock WebSocket Server for Binance testing
class MockWebSocketServer {
    wss = null;
    clients = new Set();
    connectionPromise = null;
    connectionResolve = null;
    start(port) {
        return new Promise((resolve, reject) => {
            try {
                this.wss = new WebSocketServer({ port });
                // Create promise for first client connection
                this.connectionPromise = new Promise((res) => {
                    this.connectionResolve = res;
                });
                this.wss.on('connection', (ws) => {
                    this.clients.add(ws);
                    // Resolve connection promise for first client
                    if (this.connectionResolve) {
                        this.connectionResolve(ws);
                        this.connectionResolve = null;
                    }
                    ws.on('close', () => {
                        this.clients.delete(ws);
                    });
                });
                this.wss.on('listening', () => {
                    resolve();
                });
                this.wss.on('error', (error) => {
                    reject(error);
                });
            }
            catch (error) {
                reject(error);
            }
        });
    }
    // Wait for at least one client to connect
    async waitForConnection() {
        if (this.connectionPromise) {
            await this.connectionPromise;
        }
    }
    sendToAll(message) {
        const data = JSON.stringify(message);
        this.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(data);
            }
        });
    }
    close() {
        return new Promise((resolve) => {
            // Close all client connections first
            this.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.close();
                }
            });
            this.clients.clear();
            if (this.wss) {
                this.wss.close(() => {
                    this.wss = null;
                    resolve();
                });
            }
            else {
                resolve();
            }
        });
    }
    hasConnectedClients() {
        return this.clients.size > 0;
    }
}
describe('Exchange Clients Integration Tests', () => {
    describe('BinanceSpotClient', () => {
        let mockServer;
        let client;
        const TEST_PORT = 9444; // Use different port to avoid conflicts
        beforeEach(async () => {
            // Start mock WebSocket server
            mockServer = new MockWebSocketServer();
            await mockServer.start(TEST_PORT);
        });
        afterEach(async () => {
            // Close client first
            if (client) {
                client.close();
            }
            // Wait a bit before closing server
            await new Promise(resolve => setTimeout(resolve, 100));
            // Close server
            if (mockServer) {
                await mockServer.close();
            }
            // Wait for all connections to fully close
            await new Promise(resolve => setTimeout(resolve, 200));
        });
        it('should subscribe to AggTrades WebSocket', async () => {
            // Arrange
            const symbols = ['BTCUSDT', 'ETHUSDT'];
            // Create client with custom WebSocket URL pointing to mock server
            client = new BinanceSpotClient(`ws://localhost:${TEST_PORT}`);
            // Act
            const subscribePromise = client.subscribeAggTrades(symbols);
            // Wait for client to connect to server
            await mockServer.waitForConnection();
            await subscribePromise;
            // Wait a bit for connection to stabilize
            await new Promise(resolve => setTimeout(resolve, 100));
            // Assert - Check connection status
            expect(client.isConnected()).toBe(true);
            // Assert - Check status shows subscribed symbols
            const status = client.getStatus();
            expect(status.subscribedSymbols).toBe(2);
        });
        it('should receive and parse AggTrade messages', async () => {
            // Arrange
            const symbols = ['BTCUSDT'];
            const receivedTrades = [];
            client = new BinanceSpotClient(`ws://localhost:${TEST_PORT}`);
            client.onTrade('BTCUSDT', (trades) => {
                receivedTrades.push(...trades);
            });
            const subscribePromise = client.subscribeAggTrades(symbols);
            await mockServer.waitForConnection();
            await subscribePromise;
            await new Promise(resolve => setTimeout(resolve, 100));
            // Act - Send mock AggTrade message
            const mockTrade = {
                e: 'aggTrade',
                s: 'BTCUSDT',
                p: '50000.00',
                q: '0.5',
                T: Date.now(),
                m: false
            };
            mockServer.sendToAll(mockTrade);
            // Wait for message processing
            await new Promise(resolve => setTimeout(resolve, 200));
            // Assert
            expect(receivedTrades).toHaveLength(1);
            expect(receivedTrades[0].symbol).toBe('BTCUSDT');
            expect(receivedTrades[0].price).toBe(50000);
            expect(receivedTrades[0].qty).toBe(0.5);
            expect(receivedTrades[0].isBuyerMaker).toBe(false);
        });
        it('should reconnect after WebSocket close', async () => {
            // Arrange
            const symbols = ['BTCUSDT'];
            client = new BinanceSpotClient(`ws://localhost:${TEST_PORT}`);
            const subscribePromise = client.subscribeAggTrades(symbols);
            await mockServer.waitForConnection();
            await subscribePromise;
            await new Promise(resolve => setTimeout(resolve, 100));
            expect(client.isConnected()).toBe(true);
            // Act - Close the server to trigger reconnection
            await mockServer.close();
            await new Promise(resolve => setTimeout(resolve, 200));
            // Assert - Client should detect disconnection
            expect(client.isConnected()).toBe(false);
            // Restart server for reconnection
            mockServer = new MockWebSocketServer();
            await mockServer.start(TEST_PORT);
            // Wait for reconnection attempt (2 second delay + connection time)
            await mockServer.waitForConnection();
            await new Promise(resolve => setTimeout(resolve, 500));
            // Assert - Client should reconnect
            expect(client.isConnected()).toBe(true);
        }, 10000); // Increase timeout for this test
        it('should stop reconnecting after max attempts', async () => {
            // Arrange
            const symbols = ['BTCUSDT'];
            client = new BinanceSpotClient(`ws://localhost:${TEST_PORT}`);
            const subscribePromise = client.subscribeAggTrades(symbols);
            await mockServer.waitForConnection();
            await subscribePromise;
            await new Promise(resolve => setTimeout(resolve, 100));
            // Act - Close server permanently
            await mockServer.close();
            await new Promise(resolve => setTimeout(resolve, 100));
            // Wait for all reconnection attempts (3 attempts * 2s delay = 6s + buffer)
            await new Promise(resolve => setTimeout(resolve, 8000));
            // Assert - Client should give up after 3 attempts
            const status = client.getStatus();
            expect(status.connected).toBe(false);
            expect(status.reconnectAttempts).toBe(3);
        }, 15000);
    });
    describe('BybitPerpsClient', () => {
        let client;
        beforeEach(() => {
            // Use mock credentials for testing
            client = new BybitPerpsClient('test_api_key', 'test_api_secret');
        });
        it('should fetch top symbols by volume', async () => {
            // Mock fetch for this test
            const mockFetch = jest.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    result: {
                        list: [
                            { symbol: 'BTCUSDT', turnover24h: '5000000000' },
                            { symbol: 'ETHUSDT', turnover24h: '3000000000' },
                            { symbol: 'SOLUSDT', turnover24h: '2000000000' },
                            { symbol: 'LOWVOLUME', turnover24h: '500000' } // Below $1M threshold
                        ]
                    }
                })
            });
            global.fetch = mockFetch;
            // Act
            const symbols = await client.fetchTopSymbols(10);
            // Assert
            expect(symbols).toHaveLength(3); // LOWVOLUME filtered out
            expect(symbols[0]).toBe('BTCUSDT'); // Highest volume first
            expect(symbols[1]).toBe('ETHUSDT');
            expect(symbols[2]).toBe('SOLUSDT');
            // Verify API call
            expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/v5/market/tickers?category=linear'));
        });
        it('should fetch OHLCV data', async () => {
            // Mock fetch
            const mockFetch = jest.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    result: {
                        list: [
                            ['1700000000000', '50000', '51000', '49000', '50500', '100'],
                            ['1699996400000', '49500', '50000', '49000', '50000', '90']
                        ]
                    }
                })
            });
            global.fetch = mockFetch;
            // Act
            const ohlcv = await client.fetchOHLCV('BTCUSDT', '1h', 2);
            // Assert
            expect(ohlcv).toHaveLength(2);
            expect(ohlcv[0].timestamp).toBe(1699996400000);
            expect(ohlcv[0].close).toBe(50000);
            expect(ohlcv[1].timestamp).toBe(1700000000000);
            expect(ohlcv[1].close).toBe(50500);
        });
        it('should place order with correct signature', async () => {
            // Mock fetch
            const mockFetch = jest.fn()
                .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ retCode: 0 })
            })
                .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    retCode: 0,
                    result: { orderId: '12345' }
                })
            });
            global.fetch = mockFetch;
            // Act
            const orderParams = {
                symbol: 'BTCUSDT',
                side: 'Buy',
                type: 'Market',
                qty: 0.001,
                leverage: 10
            };
            const result = await client.placeOrder(orderParams);
            // Assert
            expect(result.retCode).toBe(0);
            expect(result.result.orderId).toBe('12345');
            // Verify leverage was set first
            expect(mockFetch).toHaveBeenCalledTimes(2);
            expect(mockFetch.mock.calls[0][0]).toContain('/v5/position/set-leverage');
            expect(mockFetch.mock.calls[1][0]).toContain('/v5/order/create');
            // Verify signature header is present
            const orderCall = mockFetch.mock.calls[1][1];
            expect(orderCall.headers['X-BAPI-SIGN']).toBeDefined();
            expect(orderCall.headers['X-BAPI-API-KEY']).toBe('test_api_key');
        });
        it('should timeout order placement after 2 seconds', async () => {
            // Mock fetch with delay
            const mockFetch = jest.fn()
                .mockResolvedValueOnce({ ok: true, json: async () => ({}) }) // setLeverage
                .mockImplementation(() => new Promise(resolve => setTimeout(resolve, 3000)) // 3 second delay
            );
            global.fetch = mockFetch;
            // Act & Assert
            const orderParams = {
                symbol: 'BTCUSDT',
                side: 'Buy',
                type: 'Market',
                qty: 0.001,
                leverage: 10
            };
            await expect(client.placeOrderWithTimeout(orderParams))
                .rejects.toThrow('ORDER_TIMEOUT');
        });
    });
    describe('MEXCPerpsClient', () => {
        let client;
        beforeEach(() => {
            client = new MEXCPerpsClient('test_api_key', 'test_api_secret');
        });
        it('should place order with MEXC-specific format', async () => {
            // Mock fetch
            const mockFetch = jest.fn()
                .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ code: 0 })
            })
                .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    code: 0,
                    data: { orderId: '67890' }
                })
            });
            global.fetch = mockFetch;
            // Act
            const orderParams = {
                symbol: 'BTCUSDT',
                side: 'Buy',
                type: 'Market',
                qty: 0.001,
                leverage: 10
            };
            const result = await client.placeOrder(orderParams);
            // Assert
            expect(result.code).toBe(0);
            expect(result.data.orderId).toBe('67890');
            // Verify MEXC-specific format
            const orderCall = mockFetch.mock.calls[1];
            const body = JSON.parse(orderCall[1].body);
            expect(body.side).toBe(1); // 1 = Open Long
            expect(body.type).toBe(5); // 5 = Market Order
            expect(body.openType).toBe(1); // 1 = Isolated
            // Verify signature header
            expect(orderCall[1].headers.Signature).toBeDefined();
            expect(orderCall[1].headers.ApiKey).toBe('test_api_key');
        });
        it('should respect rate limiting (10 req/s)', async () => {
            // Mock fetch
            const mockFetch = jest.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ code: 0 })
            });
            global.fetch = mockFetch;
            // Act - Send 15 requests rapidly
            const startTime = Date.now();
            const promises = Array.from({ length: 15 }, (_, i) => client.setLeverage(`SYMBOL${i}`, 10));
            await Promise.all(promises);
            const duration = Date.now() - startTime;
            // Assert - Should take at least 1 second (10 req/s limit)
            expect(duration).toBeGreaterThanOrEqual(1000);
            expect(mockFetch).toHaveBeenCalledTimes(15);
        });
    });
    describe('ExchangeGateway', () => {
        let gateway;
        let mockBybitClient;
        let mockMexcClient;
        let mockConfig;
        beforeEach(() => {
            // Create mock clients
            mockBybitClient = new BybitPerpsClient('test_key', 'test_secret');
            mockMexcClient = new MEXCPerpsClient('test_key', 'test_secret');
            // Create mock config
            mockConfig = {
                getConfig: jest.fn().mockReturnValue({
                    exchanges: {
                        bybit: { enabled: true, executeOn: true },
                        mexc: { enabled: true, executeOn: true }
                    }
                })
            };
            gateway = new ExchangeGateway(mockBybitClient, mockMexcClient, mockConfig);
        });
        it('should execute on all enabled exchanges in parallel', async () => {
            // Mock fetch for both exchanges
            const mockFetch = jest.fn()
                .mockResolvedValue({
                ok: true,
                json: async () => ({ retCode: 0, code: 0 })
            });
            global.fetch = mockFetch;
            // Create test trap
            const trap = {
                symbol: 'BTCUSDT',
                triggerPrice: 50000,
                direction: 'LONG',
                trapType: 'LIQUIDATION',
                confidence: 95,
                leverage: 20,
                estimatedCascadeSize: 0.05,
                activated: true
            };
            const orderParams = {
                symbol: 'BTCUSDT',
                side: 'Buy',
                type: 'Market',
                qty: 0.001,
                leverage: 20
            };
            // Act
            const startTime = Date.now();
            const results = await gateway.executeOnAllTargets(trap, orderParams);
            const duration = Date.now() - startTime;
            // Assert - Both exchanges executed
            expect(results).toHaveLength(2);
            expect(results[0].exchange).toBe('Bybit');
            expect(results[0].success).toBe(true);
            expect(results[1].exchange).toBe('MEXC');
            expect(results[1].success).toBe(true);
            // Assert - Parallel execution (should be fast, not sequential)
            expect(duration).toBeLessThan(1000);
        });
        it('should handle partial failures gracefully', async () => {
            // Mock fetch - Bybit succeeds, MEXC fails
            const mockFetch = jest.fn()
                .mockResolvedValueOnce({ ok: true, json: async () => ({}) }) // Bybit leverage
                .mockResolvedValueOnce({ ok: true, json: async () => ({ retCode: 0 }) }) // Bybit order
                .mockResolvedValueOnce({ ok: true, json: async () => ({}) }) // MEXC leverage
                .mockRejectedValueOnce(new Error('MEXC API Error')); // MEXC order fails
            global.fetch = mockFetch;
            const trap = {
                symbol: 'BTCUSDT',
                triggerPrice: 50000,
                direction: 'LONG',
                trapType: 'LIQUIDATION',
                confidence: 95,
                leverage: 20,
                estimatedCascadeSize: 0.05,
                activated: true
            };
            const orderParams = {
                symbol: 'BTCUSDT',
                side: 'Buy',
                type: 'Market',
                qty: 0.001,
                leverage: 20
            };
            // Act
            const results = await gateway.executeOnAllTargets(trap, orderParams);
            // Assert - Bybit succeeded, MEXC failed
            expect(results).toHaveLength(2);
            const bybitResult = results.find(r => r.exchange === 'Bybit');
            expect(bybitResult?.success).toBe(true);
            const mexcResult = results.find(r => r.exchange === 'MEXC');
            expect(mexcResult?.success).toBe(false);
            expect(mexcResult?.error).toContain('MEXC API Error');
        });
        it('should skip disabled exchanges', async () => {
            // Mock config with MEXC disabled
            mockConfig.getConfig = jest.fn().mockReturnValue({
                exchanges: {
                    bybit: { enabled: true, executeOn: true },
                    mexc: { enabled: false, executeOn: false }
                }
            });
            const mockFetch = jest.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ retCode: 0 })
            });
            global.fetch = mockFetch;
            const trap = {
                symbol: 'BTCUSDT',
                triggerPrice: 50000,
                direction: 'LONG',
                trapType: 'LIQUIDATION',
                confidence: 95,
                leverage: 20,
                estimatedCascadeSize: 0.05,
                activated: true
            };
            const orderParams = {
                symbol: 'BTCUSDT',
                side: 'Buy',
                type: 'Market',
                qty: 0.001,
                leverage: 20
            };
            // Act
            const results = await gateway.executeOnAllTargets(trap, orderParams);
            // Assert - Only Bybit executed
            expect(results).toHaveLength(1);
            expect(results[0].exchange).toBe('Bybit');
        });
        it('should return empty array when no exchanges enabled', async () => {
            // Mock config with all exchanges disabled
            mockConfig.getConfig = jest.fn().mockReturnValue({
                exchanges: {
                    bybit: { enabled: false, executeOn: false },
                    mexc: { enabled: false, executeOn: false }
                }
            });
            const trap = {
                symbol: 'BTCUSDT',
                triggerPrice: 50000,
                direction: 'LONG',
                trapType: 'LIQUIDATION',
                confidence: 95,
                leverage: 20,
                estimatedCascadeSize: 0.05,
                activated: true
            };
            const orderParams = {
                symbol: 'BTCUSDT',
                side: 'Buy',
                type: 'Market',
                qty: 0.001,
                leverage: 20
            };
            // Act
            const results = await gateway.executeOnAllTargets(trap, orderParams);
            // Assert
            expect(results).toHaveLength(0);
        });
    });
});
//# sourceMappingURL=ExchangeClients.integration.test.js.map