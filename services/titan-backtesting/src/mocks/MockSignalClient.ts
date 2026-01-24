export class MockSignalClient {
  constructor() {}

  public async connect(): Promise<void> {
    // No-op
  }

  public async close(): Promise<void> {
    // No-op
  }

  public sendSignal(signal: any): void {
    console.log('[MockSignalClient] Signal sent:', signal);
  }
}
