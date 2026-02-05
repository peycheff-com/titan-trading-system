/**
 * Symbol Normalization Tests
 *
 * Tests for normalizeSymbol() and denormalizeSymbol() utilities
 * covering all supported venues and instrument types.
 */
import { denormalizeSymbol, normalizeSymbol } from '../../src/utils/symbol-normalization';
import { InstrumentType, VenueId } from '../../src/types/venues';

describe('Symbol Normalization', () => {
  describe('normalizeSymbol', () => {
    describe('Binance', () => {
      it('normalizes spot symbols', () => {
        const result = normalizeSymbol(VenueId.BINANCE, 'BTCUSDT', InstrumentType.SPOT);
        expect(result.symbol).toBe('BTC/USDT');
        expect(result.base).toBe('BTC');
        expect(result.quote).toBe('USDT');
        expect(result.type).toBe(InstrumentType.SPOT);
      });

      it('normalizes perp symbols', () => {
        const result = normalizeSymbol(VenueId.BINANCE, 'ETHUSDT', InstrumentType.PERP);
        expect(result.symbol).toBe('ETH/USDT:PERP');
        expect(result.base).toBe('ETH');
        expect(result.quote).toBe('USDT');
        expect(result.type).toBe(InstrumentType.PERP);
      });

      it('handles USDC pairs', () => {
        const result = normalizeSymbol(VenueId.BINANCE, 'BTCUSDC', InstrumentType.SPOT);
        expect(result.symbol).toBe('BTC/USDC');
        expect(result.quote).toBe('USDC');
      });

      it('handles BTC quote pairs', () => {
        const result = normalizeSymbol(VenueId.BINANCE, 'ETHBTC', InstrumentType.SPOT);
        expect(result.symbol).toBe('ETH/BTC');
        expect(result.quote).toBe('BTC');
      });
    });

    describe('Bybit', () => {
      it('normalizes spot symbols like Binance', () => {
        const result = normalizeSymbol(VenueId.BYBIT, 'SOLUSDT', InstrumentType.SPOT);
        expect(result.symbol).toBe('SOL/USDT');
        expect(result.base).toBe('SOL');
      });

      it('normalizes perp symbols', () => {
        const result = normalizeSymbol(VenueId.BYBIT, 'BTCUSDT', InstrumentType.PERP);
        expect(result.symbol).toBe('BTC/USDT:PERP');
        expect(result.type).toBe(InstrumentType.PERP);
      });
    });

    describe('Coinbase', () => {
      it('normalizes dash-separated symbols', () => {
        const result = normalizeSymbol(VenueId.COINBASE, 'BTC-USD', InstrumentType.SPOT);
        expect(result.symbol).toBe('BTC/USD');
        expect(result.base).toBe('BTC');
        expect(result.quote).toBe('USD');
        expect(result.type).toBe(InstrumentType.SPOT);
      });

      it('normalizes EUR pairs', () => {
        const result = normalizeSymbol(VenueId.COINBASE, 'ETH-EUR', InstrumentType.SPOT);
        expect(result.symbol).toBe('ETH/EUR');
      });
    });

    describe('Kraken', () => {
      it('normalizes slash-separated symbols', () => {
        const result = normalizeSymbol(VenueId.KRAKEN, 'BTC/USD', InstrumentType.SPOT);
        expect(result.symbol).toBe('BTC/USD');
      });

      it('maps XBT to BTC', () => {
        const result = normalizeSymbol(VenueId.KRAKEN, 'XBT/USD', InstrumentType.SPOT);
        expect(result.symbol).toBe('BTC/USD');
        expect(result.base).toBe('BTC');
      });

      it('normalizes concatenated format XXBTZUSD', () => {
        const result = normalizeSymbol(VenueId.KRAKEN, 'XXBTZUSD', InstrumentType.SPOT);
        expect(result.symbol).toBe('BTC/USD');
        expect(result.base).toBe('BTC');
        expect(result.quote).toBe('USD');
      });

      it('normalizes perp symbols', () => {
        const result = normalizeSymbol(VenueId.KRAKEN, 'XBT/USD', InstrumentType.PERP);
        expect(result.symbol).toBe('BTC/USD:PERP');
      });
    });

    describe('MEXC', () => {
      it('normalizes underscore-separated symbols', () => {
        const result = normalizeSymbol(VenueId.MEXC, 'BTC_USDT', InstrumentType.SPOT);
        expect(result.symbol).toBe('BTC/USDT');
        expect(result.base).toBe('BTC');
        expect(result.quote).toBe('USDT');
      });

      it('normalizes concatenated format like Binance', () => {
        const result = normalizeSymbol(VenueId.MEXC, 'ETHUSDT', InstrumentType.SPOT);
        expect(result.symbol).toBe('ETH/USDT');
      });

      it('normalizes perp symbols', () => {
        const result = normalizeSymbol(VenueId.MEXC, 'BTC_USDT', InstrumentType.PERP);
        expect(result.symbol).toBe('BTC/USDT:PERP');
      });
    });

    describe('Hyperliquid', () => {
      it('normalizes perp symbols (always USD quoted)', () => {
        const result = normalizeSymbol(VenueId.HYPERLIQUID, 'BTC', InstrumentType.PERP);
        expect(result.symbol).toBe('BTC/USD:PERP');
        expect(result.base).toBe('BTC');
        expect(result.quote).toBe('USD');
        expect(result.type).toBe(InstrumentType.PERP);
      });

      it('removes -PERP suffix if present', () => {
        const result = normalizeSymbol(VenueId.HYPERLIQUID, 'ETH-PERP', InstrumentType.PERP);
        expect(result.symbol).toBe('ETH/USD:PERP');
        expect(result.base).toBe('ETH');
      });
    });

    describe('Deribit', () => {
      it('normalizes perpetual symbols', () => {
        const result = normalizeSymbol(VenueId.DERIBIT, 'BTC-PERPETUAL', InstrumentType.PERP);
        expect(result.symbol).toBe('BTC/USD:PERP');
        expect(result.base).toBe('BTC');
        expect(result.quote).toBe('USD');
        expect(result.type).toBe(InstrumentType.PERP);
      });

      it('normalizes future symbols', () => {
        const result = normalizeSymbol(VenueId.DERIBIT, 'BTC-15MAR26', InstrumentType.FUTURE);
        expect(result.symbol).toBe('BTC/USD:20260315');
        expect(result.base).toBe('BTC');
        expect(result.type).toBe(InstrumentType.FUTURE);
        expect(result.expiry).toBe('20260315');
      });

      it('normalizes call option symbols', () => {
        const result = normalizeSymbol(
          VenueId.DERIBIT,
          'BTC-15MAR26-80000-C',
          InstrumentType.OPTION,
        );
        expect(result.symbol).toBe('BTC/USD:20260315-80000-C');
        expect(result.type).toBe(InstrumentType.OPTION);
        expect(result.expiry).toBe('20260315');
        expect(result.strike).toBe('80000');
        expect(result.optionType).toBe('C');
      });

      it('normalizes put option symbols', () => {
        const result = normalizeSymbol(
          VenueId.DERIBIT,
          'ETH-28JUN26-5000-P',
          InstrumentType.OPTION,
        );
        expect(result.symbol).toBe('ETH/USD:20260628-5000-P');
        expect(result.type).toBe(InstrumentType.OPTION);
        expect(result.optionType).toBe('P');
      });
    });

    describe('Edge Cases', () => {
      it('handles lowercase input', () => {
        const result = normalizeSymbol(VenueId.BINANCE, 'btcusdt', InstrumentType.SPOT);
        expect(result.symbol).toBe('BTC/USDT');
      });

      it('handles already normalized symbols', () => {
        const result = normalizeSymbol(VenueId.BINANCE, 'BTC/USDT', InstrumentType.SPOT);
        // Should handle gracefully even if not strictly correct
        expect(result.base).toBeDefined();
      });
    });
  });

  describe('denormalizeSymbol', () => {
    describe('Basic pairs', () => {
      it('denormalizes to Binance format', () => {
        expect(denormalizeSymbol(VenueId.BINANCE, 'BTC/USDT')).toBe('BTCUSDT');
      });

      it('denormalizes to Coinbase format', () => {
        expect(denormalizeSymbol(VenueId.COINBASE, 'ETH/USD')).toBe('ETH-USD');
      });

      it('denormalizes to Kraken format', () => {
        expect(denormalizeSymbol(VenueId.KRAKEN, 'BTC/EUR')).toBe('BTC/EUR');
      });

      it('denormalizes to MEXC format', () => {
        expect(denormalizeSymbol(VenueId.MEXC, 'SOL/USDT')).toBe('SOL_USDT');
      });

      it('denormalizes to Hyperliquid format', () => {
        expect(denormalizeSymbol(VenueId.HYPERLIQUID, 'BTC/USD:PERP')).toBe('BTC');
      });

      it('denormalizes to Deribit perp format', () => {
        expect(denormalizeSymbol(VenueId.DERIBIT, 'BTC/USD:PERP')).toBe('BTC-PERPETUAL');
      });
    });

    describe('Roundtrip consistency', () => {
      const testCases: Array<{
        venue: VenueId;
        raw: string;
        type: InstrumentType;
      }> = [
        {
          venue: VenueId.BINANCE,
          raw: 'BTCUSDT',
          type: InstrumentType.SPOT,
        },
        {
          venue: VenueId.COINBASE,
          raw: 'ETH-USD',
          type: InstrumentType.SPOT,
        },
        {
          venue: VenueId.HYPERLIQUID,
          raw: 'BTC',
          type: InstrumentType.PERP,
        },
        {
          venue: VenueId.DERIBIT,
          raw: 'ETH-PERPETUAL',
          type: InstrumentType.PERP,
        },
      ];

      for (const { venue, raw, type } of testCases) {
        it(`roundtrips ${venue} symbol: ${raw}`, () => {
          const normalized = normalizeSymbol(venue, raw, type);
          const denormalized = denormalizeSymbol(venue, normalized.symbol);
          expect(denormalized.toLowerCase()).toBe(raw.toLowerCase());
        });
      }
    });
  });
});
