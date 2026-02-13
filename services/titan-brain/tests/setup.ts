import { EventEmitter } from "events";

// Increase max listeners to prevent memory leak warnings during tests
EventEmitter.defaultMaxListeners = 50;

// Global test setup
beforeAll(() => {
  // Ensure required secrets exist for unit tests (never production values).
  process.env.SAFETY_SECRET ||= "test-safety-secret";

  // Silence console logs during tests to keep output clean, unless debugging
  if (process.env.debug !== "true") {
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "info").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    // Keep error logs visible
  }
});

afterAll(() => {
  jest.restoreAllMocks();
});
