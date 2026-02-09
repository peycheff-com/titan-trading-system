export interface PlatformAdapter {
  getName(): string;
  getBindAddress(): string;
  getPort(): number;
  getPublicUrl(): string;
  isProduction(): boolean;
}
