/**
 * StartupManager Integration Tests
 *
 * Tests the generic StartupManager step orchestration.
 */

import { StartupManager } from "../../src/startup/StartupManager";
import { Logger } from "../../src/logging/Logger";

describe("StartupManager Generic Integration", () => {
  let startupManager: StartupManager;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger({ level: "info", enableConsole: false });
    startupManager = new StartupManager({
      maxStartupTime: 5000,
      stepTimeout: 1000,
      validateEnvironment: false,
    }, logger);
  });

  afterEach(async () => {
    await startupManager.shutdown();
  });

  it("should execution registered steps in order", async () => {
    const executionOrder: string[] = [];

    startupManager.registerStep({
      name: "step1",
      description: "First step",
      timeout: 1000,
      required: true,
      dependencies: [],
      execute: async () => {
        executionOrder.push("step1");
      },
    });

    startupManager.registerStep({
      name: "step2",
      description: "Second step",
      timeout: 1000,
      required: true,
      dependencies: ["step1"],
      execute: async () => {
        executionOrder.push("step2");
      },
    });

    await startupManager.start();

    expect(executionOrder).toEqual(["step1", "step2"]);
    expect(startupManager.isStartupComplete()).toBe(true);
  });

  it("should handle failed required steps", async () => {
    startupManager.registerStep({
      name: "fail-step",
      description: "Step that fails",
      timeout: 1000,
      required: true,
      dependencies: [],
      execute: async () => {
        throw new Error("Intentional failure");
      },
    });

    await expect(startupManager.start()).rejects.toThrow(
      "Required startup step failed: fail-step",
    );
    expect(startupManager.isStartupComplete()).toBe(false);
  });

  it("should ignore failed optional steps", async () => {
    startupManager.registerStep({
      name: "optional-fail",
      description: "Optional step that fails",
      timeout: 1000,
      required: false,
      dependencies: [],
      execute: async () => {
        throw new Error("Optional failure");
      },
    });

    startupManager.registerStep({
      name: "success-step",
      description: "Step that succeeds",
      timeout: 1000,
      required: true,
      dependencies: [], // No dependency on optional step to ensure it runs
      execute: async () => {},
    });

    await startupManager.start();
    expect(startupManager.isStartupComplete()).toBe(true);
  });

  it("should handle timeouts", async () => {
    startupManager = new StartupManager({
      maxStartupTime: 5000,
      stepTimeout: 100, // Short timeout
      maxRetries: 0,
    }, logger);

    startupManager.registerStep({
      name: "slow-step",
      description: "Step that times out",
      timeout: 50, // Even shorter timeout defined in step? No, using step timeout
      required: true,
      dependencies: [],
      execute: async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
      },
    });

    await expect(startupManager.start()).rejects.toThrow();
  });
});
