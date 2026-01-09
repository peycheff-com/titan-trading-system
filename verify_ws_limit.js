
import WebSocket from 'ws';

const URL = 'wss://titan-execution-production-a7f4.up.railway.app/ws/console';
const CLIENTS_TO_TEST = 15;
const clients = [];

console.log(`Testing connection limit with ${CLIENTS_TO_TEST} clients on ${URL}...`);

let connectedCount = 0;
let errorCount = 0;

for (let i = 0; i < CLIENTS_TO_TEST; i++) {
  const ws = new WebSocket(URL);
  
  ws.on('open', () => {
    connectedCount++;
    console.log(`Client ${i + 1} connected. Total: ${connectedCount}`);
    clients.push(ws);
    
    if (connectedCount === CLIENTS_TO_TEST) {
      console.log('SUCCESS: All clients connected!');
      process.exit(0);
    }
  });

  ws.on('error', (err) => {
    errorCount++;
    console.error(`Client ${i + 1} error:`, err.message);
  });

  ws.on('close', (code, reason) => {
    if (code === 1013) {
      console.error(`Client ${i + 1} disconnected: Insufficient Resources (Limit reached)`);
    } else {
      console.log(`Client ${i + 1} closed: ${code} ${reason}`);
    }
  });
}

setTimeout(() => {
  console.log(`Timeout reached. Connected: ${connectedCount}, Errors: ${errorCount}`);
  if (connectedCount < CLIENTS_TO_TEST) {
    console.error('FAILURE: Could not connect all clients.');
    process.exit(1);
  }
}, 10000);
