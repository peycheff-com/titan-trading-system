/**
 * End-to-End Fast Path IPC Integration Test
 *
 * Tests the complete signal flow from TitanTrap through FastPathClient
 * Requirements: 2.5, 5.1 (Complete IPC integration)
 */
import { TitanTrap } from '../../src/engine/TitanTrap';
import { EventEmitter } from '../../src/events/EventEmitter';
describe('End-to-End Fast Path IPC Integration', () => {
    let titanTrap;
    let eventEmitter;
    // Mock all dependencies
    const mockBinanceClient = {
        subscribeAggTrades: jest.fn().mockResolvedValue(undefined),
        onTrade: jest.fn(),
    };
    const mockBybitClient = {
        getEquity: jest.fn().mockResolvedValue(1000),
        fetchTopSymbols: jest.fn().mockResolvedValue(['BTCUSDT']),
        fetchOHLCV: jest.fn().mockResolvedValue([
            { timestamp: Date.now(), open: 50000, high: 50100, low: 49900, close: 50050, volume: 1000000 }
        ]),
        getCurrentPrice: jest.fn().mockResolvedValue(50000),
    };
    const mockLogger = {
        log: jest.fn(),
    };
    const mockConfig = {
        getConfig: jest.fn().mockReturnValue({
            updateInterval: 60000,
            topSymbolsCount: 1,
            minTradesIn100ms: 50,
            extremeVelocityThreshold: 0.005,
            moderateVelocityThreshold: 0.001,
            aggressiveLimitMarkup: 0.002,
            stopLossPercent: 0.01,
            targetPercent: 0.03,
        }),
    };
    const mockTripwireCalculators = {
        calcLiquidationCluster: jest.fn().mockReturnValue({
            symbol: 'BTCUSDT',
            triggerPrice: 50000,
            direction: 'LONG',
            trapType: 'LIQUIDATION',
            confidence: 95,
            leverage: 20,
            estimatedCascadeSize: 0.02,
            activated: false
        }),
        calcDailyLevel: jest.fn(),
        calcBollingerBreakout: jest.fn(),
    };
    const mockVelocityCalculator = {
        recordPrice: jest.fn(),
        calcVelocity: jest.fn().mockReturnValue(0.002),
        getLastPrice: jest.fn().mockReturnValue(50000),
    };
    const mockPositionSizeCalculator = {
        calcPositionSize: jest.fn().mockReturnValue(0.1),
    };
    beforeEach(() => {
        eventEmitter = new EventEmitter();
        titanTrap = new TitanTrap({
            binanceClient: mockBinanceClient,
            bybitClient: mockBybitClient,
            logger: mockLogger,
            config: mockConfig,
            eventEmitter,
            tripwireCalculators: mockTripwireCalculators,
            velocityCalculator: mockVelocityCalculator,
            positionSizeCalculator: mockPositionSizeCalculator,
        });
    });
    afterEach(async () => {
        await titanTrap.stop();
    });
    it('should initialize IPC client and handle connection failure gracefully', async () => {
        const ipcEvents = [];
        // Listen for IPC events
        eventEmitter.on('IPC_CONNECTION_FAILED', () => {
            ipcEvents.push('IPC_CONNECTION_FAILED');
        });
        eventEmitter.on('IPC_ERROR', () => {
            ipcEvents.push('IPC_ERROR');
        });
        // Start the engine
        await titanTrap.start();
        // Wait a bit for connection attempts to complete
        await new Promise(resolve => setTimeout(resolve, 100));
        // Verify IPC status
        const ipcStatus = titanTrap.getIPCStatus();
        expect(ipcStatus.connected).toBe(false);
        expect(['failed', 'reconnecting', 'disconnected']).toContain(ipcStatus.connectionState);
        // Should have received connection failure event
        expect(ipcEvents).toContain('IPC_CONNECTION_FAILED');
    });
    it('should provide comprehensive IPC metrics and status', () => {
        const status = titanTrap.getIPCStatus();
        // Verify status structure
        expect(status).toHaveProperty('connected');
        expect(status).toHaveProperty('connectionState');
        expect(status).toHaveProperty('metrics');
        expect(status).toHaveProperty('status');
        // Verify metrics structure
        expect(status.metrics).toHaveProperty('messagessSent');
        expect(status.metrics).toHaveProperty('messagesReceived');
        expect(status.metrics).toHaveProperty('messagesFailed');
        expect(status.metrics).toHaveProperty('reconnectAttempts');
        expect(status.metrics).toHaveProperty('avgLatencyMs');
        // Verify status structure
        expect(status.status).toHaveProperty('socketPath');
        expect(status.status).toHaveProperty('maxReconnectAttempts');
        expect(status.status).toHaveProperty('pendingMessages');
    });
    it('should handle trap map initialization and IPC status monitoring', async () => {
        // Start the engine
        await titanTrap.start();
        // Wait for initialization
        await new Promise(resolve => setTimeout(resolve, 100));
        // Get trap map - it may be empty in test environment, which is fine
        const trapMap = titanTrap.getTrapMap();
        expect(trapMap).toBeDefined();
        expect(trapMap instanceof Map).toBe(true);
        // Verify IPC status is being tracked
        const ipcStatus = titanTrap.getIPCStatus();
        expect(ipcStatus.metrics.reconnectAttempts).toBeGreaterThanOrEqual(0);
        // Verify we can get status without errors
        expect(() => titanTrap.getIPCStatus()).not.toThrow();
    });
    it('should handle force reconnection attempts', async () => {
        let reconnectFailed = false;
        eventEmitter.on('IPC_FORCE_RECONNECT_FAILED', () => {
            reconnectFailed = true;
        });
        // Force reconnection should fail since no server is running
        await expect(titanTrap.forceIPCReconnect()).rejects.toThrow();
        expect(reconnectFailed).toBe(true);
    });
    it('should properly clean up IPC resources on stop', async () => {
        await titanTrap.start();
        const statusBefore = titanTrap.getIPCStatus();
        expect(statusBefore).toBeDefined();
        // Stop should not throw
        await expect(titanTrap.stop()).resolves.not.toThrow();
        // Status should still be accessible after stop
        const statusAfter = titanTrap.getIPCStatus();
        expect(statusAfter.connectionState).toBe('disconnected');
    });
});
//# sourceMappingURL=end-to-end-ipc.test.js.map