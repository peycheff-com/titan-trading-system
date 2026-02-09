import { PlatformAdapter } from './PlatformAdapter.js';
import { GenericCloudAdapter } from './GenericCloudAdapter.js';
import { DigitalOceanAdapter } from './DigitalOceanAdapter.js';

export class PlatformFactory {
  static getAdapter(): PlatformAdapter {
    // If we detect specific cloud environment signals, use Generic Cloud
    if (process.env.RAILWAY_ENVIRONMENT || process.env.HEROKU_APP_NAME || process.env.KUBERNETES_SERVICE_HOST) {
      return new GenericCloudAdapter();
    }
    // Default to our standard Docker/DO setup
    return new DigitalOceanAdapter();
  }
}
