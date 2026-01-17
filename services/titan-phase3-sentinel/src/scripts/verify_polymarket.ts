import { PolymarketClient } from '../polymarket/PolymarketClient.js';

async function main() {
  console.log('--- Verifying Polymarket Client ---');
  const client = new PolymarketClient();

  try {
    // 1. Fetch Markets
    console.log('Fetching active markets...');
    const markets = await client.getMarkets(5);
    if (markets.length === 0) {
      console.error('FAILED: No markets returned.');
      process.exit(1);
    }
    console.log(`SUCCESS: Fetched ${markets.length} markets.`);
    console.log(`Examples: ${markets.map((m) => m.slug).join(', ')}`);

    // 2. Fetch Orderbook for first token of first market
    const firstToken = markets[0].tokens[0];
    if (firstToken) {
      console.log(`Fetching orderbook for token: ${firstToken.tokenId} (${firstToken.outcomeId})`);
      const book = await client.getOrderbook(firstToken.tokenId);
      console.log(`SUCCESS: Got Orderbook. Bids: ${book.bids.length}, Asks: ${book.asks.length}`);

      if (book.bids.length > 0 && book.asks.length > 0) {
        const mid = (parseFloat(book.bids[0].price) + parseFloat(book.asks[0].price)) / 2;
        console.log(`Mid Price: ${mid.toFixed(3)}`);
      }
    }
  } catch (error) {
    console.error('VERIFICATION FAILED:', error);
    process.exit(1);
  }
}

main();
