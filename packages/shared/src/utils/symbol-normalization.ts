/* eslint-disable functional/no-let -- Stateful runtime: mutations architecturally required */
/**
 * Symbol Normalization - Canonical symbol format for Titan
 *
 * Titan Internal Format Standard:
 * - Spot:    BASE/QUOTE           (e.g., BTC/USDT)
 * - Perp:    BASE/QUOTE:PERP      (e.g., BTC/USDT:PERP)
 * - Future:  BASE/QUOTE:YYYYMMDD  (e.g., BTC/USDT:20260315)
 * - Option:  BASE/QUOTE:YYYYMMDD-STRIKE-C/P (e.g., BTC/USDT:20260315-80000-C)
 */
import { InstrumentType, VenueId } from '../types/venues.js';

/**
 * Result of symbol normalization
 */
export interface NormalizedSymbol {
  /** Normalized Titan symbol */
  symbol: string;
  /** Base asset */
  base: string;
  /** Quote asset */
  quote: string;
  /** Instrument type */
  type: InstrumentType;
  /** Expiry date (YYYYMMDD) for futures/options */
  expiry?: string;
  /** Strike price for options */
  strike?: string;
  /** Option type: C (call) or P (put) */
  optionType?: 'C' | 'P';
}

/**
 * Common quote assets for each venue
 */
const DEFAULT_QUOTES: Record<VenueId, string> = {
  [VenueId.BINANCE]: 'USDT',
  [VenueId.BYBIT]: 'USDT',
  [VenueId.COINBASE]: 'USD',
  [VenueId.KRAKEN]: 'USD',
  [VenueId.MEXC]: 'USDT',
  [VenueId.HYPERLIQUID]: 'USD',
  [VenueId.DERIBIT]: 'USD',
};

/**
 * Month abbreviation to number mapping
 */
const MONTH_MAP: Record<string, string> = {
  JAN: '01',
  FEB: '02',
  MAR: '03',
  APR: '04',
  MAY: '05',
  JUN: '06',
  JUL: '07',
  AUG: '08',
  SEP: '09',
  OCT: '10',
  NOV: '11',
  DEC: '12',
};

/**
 * Kraken special asset names
 */
const KRAKEN_ASSET_MAP: Record<string, string> = {
  XBT: 'BTC',
  XXBT: 'BTC',
  XETH: 'ETH',
  ZEUR: 'EUR',
  ZUSD: 'USD',
  XXRP: 'XRP',
  XLTC: 'LTC',
};

/**
 * Normalize a raw exchange symbol to Titan canonical format
 */
export function normalizeSymbol(
  venue: VenueId,
  rawSymbol: string,
  instrumentType: InstrumentType,
): NormalizedSymbol {
  const raw = rawSymbol.toUpperCase();

  switch (venue) {
    case VenueId.BINANCE:
    case VenueId.BYBIT:
      return normalizeBinanceStyle(raw, instrumentType, venue);

    case VenueId.COINBASE:
      return normalizeCoinbase(raw);

    case VenueId.KRAKEN:
      return normalizeKraken(raw, instrumentType);

    case VenueId.MEXC:
      return normalizeMexc(raw, instrumentType);

    case VenueId.HYPERLIQUID:
      return normalizeHyperliquid(raw);

    case VenueId.DERIBIT:
      return normalizeDeribit(raw);

    default:
      // Fallback: assume BASE/QUOTE format already
      return parseGeneric(raw, instrumentType);
  }
}

/**
 * Binance/Bybit style: BTCUSDT
 */
function normalizeBinanceStyle(
  raw: string,
  type: InstrumentType,
  venue: VenueId,
): NormalizedSymbol {
  const quotes = ['USDT', 'USDC', 'BUSD', 'BTC', 'ETH', 'BNB', 'USD'];

  for (const quote of quotes) {
    if (raw.endsWith(quote)) {
      const base = raw.slice(0, -quote.length);
      if (base.length > 0) {
        const symbol = type === InstrumentType.PERP ? `${base}/${quote}:PERP` : `${base}/${quote}`;
        return { symbol, base, quote, type };
      }
    }
  }

  // Fallback
  return {
    symbol: type === InstrumentType.PERP ? `${raw}/USDT:PERP` : `${raw}/USDT`,
    base: raw,
    quote: DEFAULT_QUOTES[venue],
    type,
  };
}

/**
 * Coinbase style: BTC-USD
 */
function normalizeCoinbase(raw: string): NormalizedSymbol {
  const parts = raw.split('-');
  if (parts.length === 2) {
    const [base, quote] = parts;
    return {
      symbol: `${base}/${quote}`,
      base,
      quote,
      type: InstrumentType.SPOT,
    };
  }

  return {
    symbol: `${raw}/USD`,
    base: raw,
    quote: 'USD',
    type: InstrumentType.SPOT,
  };
}

/**
 * Kraken style: XBT/USD or XXBTZUSD
 */
function normalizeKraken(raw: string, type: InstrumentType): NormalizedSymbol {
  // Handle slash format
  if (raw.includes('/')) {
    const [base, quote] = raw.split('/');
    const normBase = KRAKEN_ASSET_MAP[base] ?? base;
    const normQuote = KRAKEN_ASSET_MAP[quote] ?? quote;
    const symbol =
      type === InstrumentType.PERP ? `${normBase}/${normQuote}:PERP` : `${normBase}/${normQuote}`;
    return { symbol, base: normBase, quote: normQuote, type };
  }

  // Handle concatenated format (XXBTZUSD)
  const quotes = ['ZUSD', 'ZEUR', 'USD', 'EUR', 'BTC', 'ETH'];
  for (const quote of quotes) {
    if (raw.endsWith(quote)) {
      const base = raw.slice(0, -quote.length);
      const normBase = KRAKEN_ASSET_MAP[base] ?? base;
      const normQuote = KRAKEN_ASSET_MAP[quote] ?? quote;
      const symbol =
        type === InstrumentType.PERP ? `${normBase}/${normQuote}:PERP` : `${normBase}/${normQuote}`;
      return { symbol, base: normBase, quote: normQuote, type };
    }
  }

  return {
    symbol: `${raw}/USD`,
    base: raw,
    quote: 'USD',
    type,
  };
}

/**
 * MEXC style: BTC_USDT or BTCUSDT
 */
function normalizeMexc(raw: string, type: InstrumentType): NormalizedSymbol {
  // Handle underscore format
  if (raw.includes('_')) {
    const [base, quote] = raw.split('_');
    const symbol = type === InstrumentType.PERP ? `${base}/${quote}:PERP` : `${base}/${quote}`;
    return { symbol, base, quote, type };
  }

  // Handle concatenated format
  return normalizeBinanceStyle(raw, type, VenueId.MEXC);
}

/**
 * Hyperliquid style: BTC (always perps, USD quoted)
 */
function normalizeHyperliquid(raw: string): NormalizedSymbol {
  // Remove any suffix if present
  const base = raw.replace(/-PERP$/i, '');
  return {
    symbol: `${base}/USD:PERP`,
    base,
    quote: 'USD',
    type: InstrumentType.PERP,
  };
}

/**
 * Deribit style: BTC-PERPETUAL, BTC-15MAR26, BTC-15MAR26-80000-C
 */
function normalizeDeribit(raw: string): NormalizedSymbol {
  // Perpetual
  if (raw.endsWith('-PERPETUAL')) {
    const base = raw.replace('-PERPETUAL', '');
    return {
      symbol: `${base}/USD:PERP`,
      base,
      quote: 'USD',
      type: InstrumentType.PERP,
    };
  }

  // Option: BTC-15MAR26-80000-C
  const optionMatch = raw.match(/^([A-Z0-9]+)-(\d{1,2})([A-Z]{3})(\d{2})-(\d+)-([CP])$/);
  if (optionMatch) {
    const [, base, day, monthStr, year, strike, optType] = optionMatch;
    const month = MONTH_MAP[monthStr] ?? '01';
    const fullYear = `20${year}`;
    const expiry = `${fullYear}${month}${day.padStart(2, '0')}`;
    const optionType = optType as 'C' | 'P';
    return {
      symbol: `${base}/USD:${expiry}-${strike}-${optionType}`,
      base,
      quote: 'USD',
      type: InstrumentType.OPTION,
      expiry,
      strike,
      optionType,
    };
  }

  // Future: BTC-15MAR26
  const futureMatch = raw.match(/^([A-Z0-9]+)-(\d{1,2})([A-Z]{3})(\d{2})$/);
  if (futureMatch) {
    const [, base, day, monthStr, year] = futureMatch;
    const month = MONTH_MAP[monthStr] ?? '01';
    const fullYear = `20${year}`;
    const expiry = `${fullYear}${month}${day.padStart(2, '0')}`;
    return {
      symbol: `${base}/USD:${expiry}`,
      base,
      quote: 'USD',
      type: InstrumentType.FUTURE,
      expiry,
    };
  }

  // Fallback
  return {
    symbol: `${raw}/USD`,
    base: raw,
    quote: 'USD',
    type: InstrumentType.SPOT,
  };
}

/**
 * Generic parser for already normalized symbols
 */
function parseGeneric(raw: string, type: InstrumentType): NormalizedSymbol {
  // Already in BASE/QUOTE format
  if (raw.includes('/')) {
    const [base, rest] = raw.split('/');
    const [quote, suffix] = rest.includes(':') ? rest.split(':') : [rest, undefined];

    let symbolType = type;
    let expiry: string | undefined;
    let strike: string | undefined;
    let optionType: 'C' | 'P' | undefined;

    if (suffix) {
      if (suffix === 'PERP') {
        symbolType = InstrumentType.PERP;
      } else if (suffix.includes('-')) {
        const parts = suffix.split('-');
        if (parts.length === 3) {
          [expiry, strike, optionType] = parts as [string, string, 'C' | 'P'];
          symbolType = InstrumentType.OPTION;
        }
      } else if (/^\d{8}$/.test(suffix)) {
        expiry = suffix;
        symbolType = InstrumentType.FUTURE;
      }
    }

    return {
      symbol: raw,
      base,
      quote,
      type: symbolType,
      expiry,
      strike,
      optionType,
    };
  }

  // Fallback
  return {
    symbol: `${raw}/USD`,
    base: raw,
    quote: 'USD',
    type,
  };
}

/**
 * Inverse of normalize - convert Titan symbol to exchange-specific format
 */
export function denormalizeSymbol(venue: VenueId, titanSymbol: string): string {
  // Parse Titan format
  const [basePart, rest] = titanSymbol.split('/');
  if (!rest) return titanSymbol;

  const [quotePart, suffix] = rest.includes(':') ? rest.split(':') : [rest, undefined];

  switch (venue) {
    case VenueId.BINANCE:
    case VenueId.BYBIT:
      return `${basePart}${quotePart}`;

    case VenueId.COINBASE:
      return `${basePart}-${quotePart}`;

    case VenueId.KRAKEN:
      return `${basePart}/${quotePart}`;

    case VenueId.MEXC:
      return `${basePart}_${quotePart}`;

    case VenueId.HYPERLIQUID:
      return basePart;

    case VenueId.DERIBIT:
      if (suffix === 'PERP') {
        return `${basePart}-PERPETUAL`;
      }
      // TODO: Handle futures and options
      return titanSymbol;

    default:
      return titanSymbol;
  }
}
