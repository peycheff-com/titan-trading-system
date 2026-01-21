export class StructuredLogger {
  info(_message?: string, _correlationId?: string, _metadata?: unknown): void {}
  warn(_message?: string, _correlationId?: string, _metadata?: unknown): void {}
  error(_message?: string, _correlationId?: string, _metadata?: unknown): void {}
  debug(_message?: string, _correlationId?: string, _metadata?: unknown): void {}
  logSecurityEvent(
    _message: string,
    _severity: string,
    _correlationId?: string,
    _metadata?: unknown,
  ): void {}
}

export const getLogger = () => new StructuredLogger();
export const resetLogger = () => undefined;
export const createRequestLogger = () => new StructuredLogger();

export class PrometheusMetrics {
  collectDefaultMetrics(): void {}
}

export const getMetrics = () => ({});
export const resetMetrics = () => undefined;
