/**
 * Fast Path IPC Integration Test
 *
 * Tests the integration between TitanTrap and FastPathClient
 * Requirements: 2.5, 5.1 (Fast Path IPC Integration)
 */
import { TitanTrap } from '../../src/engine/TitanTrap';
import { EventEmitter } from '../../src/events/EventEmitter';
// Mock dependencies
const mockBinanceClient = {
    subscribeAggTrades: jest.fn(),
    onTrade: jest.fn(),
};
const mockBybitClient = {
    getEquity: jest.fn().mockResolvedValue(1000),
    fetchTopSymbols: jest.fn().mockResolvedValue(['BTCUSDT', 'ETHUSDT']),
    fetchOHLCV: jest.fn().mockResolvedValue([]),
    getCurrentPrice: jest.fn().mockResolvedValue(50000),
};
const mockLogger = {
    log: jest.fn(),
};
const mockConfig = {
    getConfig: jest.fn().mockReturnValue({
        updateInterval: 60000,
        topSymbolsCount: 2,
        minTradesIn100ms: 50,
        extremeVelocityThreshold: 0.005,
        moderateVelocityThreshold: 0.001,
        aggressiveLimitMarkup: 0.002,
        stopLossPercent: 0.01,
        targetPercent: 0.03,
    }),
};
const mockTripwireCalculators = {
    calcLiquidationCluster: jest.fn(),
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
describe('Fast Path IPC Integration', () => {
    let titanTrap;
    let eventEmitter;
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
    it('should initialize FastPathClient with correct configuration', () => {
        const ipcStatus = titanTrap.getIPCStatus();
        expect(ipcStatus).toBeDefined();
        expect(ipcStatus.connected).toBe(false); // Not connected initially
        expect(ipcStatus.connectionState).toBe('disconnected');
        expect(ipcStatus.metrics).toBeDefined();
        expect(ipcStatus.status).toBeDefined();
    });
    it('should handle IPC connection failure gracefully', async () => {
        let ipcConnectionFailed = false;
        eventEmitter.on('IPC_CONNECTION_FAILED', () => {
            ipcConnectionFailed = true;
        });
        // Start should not throw even if IPC connection fails
        await expect(titanTrap.start()).resolves.not.toThrow();
        // Should have emitted IPC_CONNECTION_FAILED event
        expect(ipcConnectionFailed).toBe(true);
    });
    it('should provide IPC status and metrics', () => {
        const status = titanTrap.getIPCStatus();
        expect(status.connected).toBe(false);
        expect(status.connectionState).toBe('disconnected');
        expect(status.metrics).toHaveProperty('messagessSent');
        expect(status.metrics).toHaveProperty('messagesReceived');
        expect(status.metrics).toHaveProperty('messagesFailed');
        expect(status.status).toHaveProperty('socketPath');
        expect(status.status).toHaveProperty('maxReconnectAttempts');
    });
    it('should handle force reconnection', async () => {
        // Force reconnection should handle failure gracefully
        await expect(titanTrap.forceIPCReconnect()).rejects.toThrow();
    });
    it('should emit IPC events correctly', (done) => {
        let eventsReceived = 0;
        const expectedEvents = ['IPC_CONNECTION_FAILED'];
        expectedEvents.forEach(eventType => {
            eventEmitter.on(eventType, () => {
                eventsReceived++;
                if (eventsReceived === expectedEvents.length) {
                    done();
                }
            });
        });
        // Start the engine to trigger IPC connection attempt
        titanTrap.start();
    });
});
//# sourceMappingURL=ipc-integration.test.js.map