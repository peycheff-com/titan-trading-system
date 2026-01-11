const { spawn } = require('child_process');

const serviceName = process.env.RAILWAY_SERVICE_NAME || '';
console.log(`[Dispatch] Detected Service Name: "${serviceName}"`);

const serviceMap = {
  'Titan Brain': 'npm run start:brain',
  'Titan Execution': 'npm run start:execution',
  'Titan Console': 'npm run start:console',
  'Titan Scavenger': 'npm run start:scavenger',
  'Titan Sentinel': 'npm run start:sentinel',
  'Titan Hunter': 'npm run start:hunter',
  'Titan AI Quant': 'npm run start:ai-quant', // Assuming ai-quant script
};

// Default to Console if unknown or if running locally without service name (safe fallback?)
// But for safety in production, we might want to fail or default to help.
// Given the current issue is everyone running Console, maybe default to Console is what caused it?
// Let's being strict.
let command = serviceMap[serviceName];

if (!command) {
  console.warn(`[Dispatch] Unknown service name "${serviceName}". Checking for partial matches...`);
  // Fallback checks
  if (serviceName.includes('Brain')) command = serviceMap['Titan Brain'];
  else if (serviceName.includes('Execution')) command = serviceMap['Titan Execution'];
  else if (serviceName.includes('Console')) command = serviceMap['Titan Console'];
  else if (serviceName.includes('Scavenger')) command = serviceMap['Titan Scavenger'];
  else if (serviceName.includes('Sentinel')) command = serviceMap['Titan Sentinel'];
  else if (serviceName.includes('Hunter')) command = serviceMap['Titan Hunter'];
  else {
    console.error(`[Dispatch] CRITICAL: Could not determine service for "${serviceName}". Defaulting to Titan Console (legacy behavior).`);
    command = 'npm run start:console';
  }
}

console.log(`[Dispatch] Starting command: ${command}`);

const [cmd, ...args] = command.split(' ');
const child = spawn(cmd, args, { stdio: 'inherit', shell: true });

child.on('exit', (code) => {
  process.exit(code);
});
