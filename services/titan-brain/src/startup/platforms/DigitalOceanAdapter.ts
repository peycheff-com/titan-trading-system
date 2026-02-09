import { PlatformAdapter } from './PlatformAdapter.js';

export class DigitalOceanAdapter implements PlatformAdapter {
  getName(): string {
    return 'DigitalOcean (Docker)';
  }

  getBindAddress(): string {
    return '0.0.0.0';
  }

  getPort(): number {
    return parseInt(process.env.PORT || '3000', 10);
  }

  getPublicUrl(): string {
    return process.env.APP_URL || `http://localhost:${this.getPort()}`;
  }

  isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  }
}
