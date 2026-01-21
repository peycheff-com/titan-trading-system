import { Logger, SharedLogLevel } from "@titan/shared";

// Create a configured logger instance for Titan Brain
const logLevelStr = process.env.LOG_LEVEL || "INFO";
const logLevel = SharedLogLevel[logLevelStr as keyof typeof SharedLogLevel] ??
  SharedLogLevel.INFO;

export const logger = new Logger({
  component: "titan-brain",
  level: logLevel,
  enableConsole: true,
  enableFile: true,
  filePath: "./logs/titan-brain.log",
  enablePerformanceLogging: false,
  sensitiveFields: ["password", "secret", "key", "token"],
  maxStackTraceLines: 10,
});
