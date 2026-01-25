import { PowerLawService } from "./service.js";

async function main() {
  console.log(
    `[PowerLaw] Starting with NATS_USER=${
      process.env.NATS_USER ? "SET" : "UNSET"
    }`,
  );
  const service = new PowerLawService();
  await service.start();
}

main().catch(console.error);
