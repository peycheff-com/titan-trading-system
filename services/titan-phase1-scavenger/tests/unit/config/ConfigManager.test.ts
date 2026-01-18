import { ConfigManager, TrapConfig } from "../../../src/config/ConfigManager";

// Mock shared config manager
const mockLoadPhaseConfig = jest.fn();
const mockGetPhaseConfig = jest.fn();
const mockSavePhaseConfig = jest.fn();
const mockOn = jest.fn();
const mockRemoveAllListeners = jest.fn();

jest.mock("@titan/shared", () => ({
    getConfigManager: jest.fn(() => ({
        loadPhaseConfig: mockLoadPhaseConfig,
        loadBrainConfig: jest.fn(),
        getPhaseConfig: mockGetPhaseConfig,
        savePhaseConfig: mockSavePhaseConfig,
        on: mockOn,
        removeAllListeners: mockRemoveAllListeners,
        getBrainConfig: jest.fn().mockReturnValue({}),
    })),
}));

describe("ConfigManager", () => {
    let manager: ConfigManager;

    beforeEach(() => {
        jest.clearAllMocks();
        manager = new ConfigManager();
    });

    afterEach(() => {
        // manager.destroy(); // Not implemented?
    });

    test("should initialize and save defaults if config missing", async () => {
        mockLoadPhaseConfig.mockResolvedValue({});

        await manager.initialize();

        expect(mockSavePhaseConfig).toHaveBeenCalled();
        const savedConfig = mockSavePhaseConfig.mock.calls[0][1];
        expect(savedConfig.enabled).toBe(true);
        expect(savedConfig.trapConfig).toBeUndefined(); // Defaults are flat in Scavenger v1?
        // Wait, Scavenger defaults in ConfigManager.ts:
        // return { updateInterval: 60000, ... }
        // Yes it returns flat TrapConfig structure.
        expect(savedConfig.maxLeverage).toBe(20);
    });

    test("should load existing config", async () => {
        const existing = {
            enabled: true,
            maxLeverage: 30,
            exchanges: {},
            maxPositionSizePercent: 0.5,
        };
        mockLoadPhaseConfig.mockResolvedValue(existing);
        mockGetPhaseConfig.mockReturnValue(existing);

        await manager.initialize();

        const config = manager.getConfig();
        expect(config.effective.maxLeverage).toBe(30);
    });

    test("should update config", async () => {
        mockGetPhaseConfig.mockReturnValue({});
        await manager.initialize();

        const update: Partial<TrapConfig> = {
            maxLeverage: 50,
        };

        manager.updatePhaseConfig(update);
        expect(mockSavePhaseConfig).toHaveBeenCalled();
    });
});
