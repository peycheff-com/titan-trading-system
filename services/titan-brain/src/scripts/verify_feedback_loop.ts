import { createHmac } from 'node:crypto';

const BRAIN_URL = 'http://localhost:3100';
const SECRET = process.env.HMAC_SECRET || 'mysecret';

function sign(payload: any) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const data = `${timestamp}.${payload}`;
  const signature = createHmac('sha256', SECRET).update(data, 'utf8').digest('hex');
  return { signature, timestamp };
}

async function main() {
  console.log('--- Verifying Brain Feedback Loop ---');

  const executionReport = {
    symbol: 'BTCUSDT',
    side: 'Buy',
    orderId: 'test-order-1',
    execPrice: '50000',
    execQty: '1.0',
    fee: '10',
    phaseId: 'phase-2',
    timestamp: Date.now(),
  };

  try {
    console.log('Sending Buy Execution Report...');
    const body1 = JSON.stringify(executionReport);
    const { signature: sig1, timestamp: ts1 } = sign(body1);

    const response1 = await fetch(`${BRAIN_URL}/webhook/execution-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-signature': sig1,
        'x-timestamp': ts1,
      },
      body: body1,
    });

    if (!response1.ok) {
      const text = await response1.text();
      throw new Error(`Failed to send report: ${response1.statusText} - ${text}`);
    }
    console.log('SUCCESS: Accepted Buy Report');

    // 2. Send Sell Report (Closing position)
    const closeReport = {
      ...executionReport,
      side: 'Sell',
      orderId: 'test-order-2',
      execPrice: '51000', // $1000 Profit
      timestamp: Date.now() + 1000,
    };

    const body2 = JSON.stringify(closeReport);
    const { signature: sig2, timestamp: ts2 } = sign(body2);

    console.log('Sending Sell Execution Report...');
    const response2 = await fetch(`${BRAIN_URL}/webhook/execution-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-signature': sig2,
        'x-timestamp': ts2,
      },
      body: body2,
    });

    if (!response2.ok) {
      const text = await response2.text();
      throw new Error(`Failed to send close report: ${response2.statusText} - ${text}`);
    }
    console.log('SUCCESS: Accepted Sell Report');
    console.log('Check Titan Brain logs for PnL calculation: Should see ~$1000 profit.');
  } catch (error) {
    console.error('VERIFICATION FAILED:', error);
    console.log('Ensure Titan Brain is running on port 3100');
    process.exit(1);
  }
}

main();
