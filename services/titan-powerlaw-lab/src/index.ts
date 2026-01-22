import { PowerLawService } from './service.js';

async function main() {
  const service = new PowerLawService();
  await service.start();
}

main().catch(console.error);
