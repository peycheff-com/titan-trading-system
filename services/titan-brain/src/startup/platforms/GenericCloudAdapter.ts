import { PlatformAdapter } from './PlatformAdapter.js';

export class GenericCloudAdapter implements PlatformAdapter {
  getName(): string {
    return 'Generic Cloud (12-Factor)';
  }

  getBindAddress(): string {
    return '0.0.0.0'; // Standard for cloud runtimes
  }

  getPort(): number {
    return parseInt(process.env.PORT || '3000', 10);
  }

  getPublicUrl(): string {
    return process.env.PUBLIC_URL || process.env.APP_URL || `http://localhost:${this.getPort()}`;
  }

  isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  }
}
