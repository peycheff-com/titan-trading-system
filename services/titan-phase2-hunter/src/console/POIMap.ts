/**
 * POI Map Component
 * Displays Points of Interest (Order Blocks, FVGs, Liquidity Pools)
 *
 * Requirements: 8.4 (POI Map Component)
 * - Display active Order Blocks with distance and confidence
 * - Display active FVGs with distance and confidence
 * - Display active Liquidity Pools with strength
 * - Color code by proximity (red < 0.5%, yellow < 2%)
 */

export interface POIEntry {
  id: string;
  type: 'ORDER_BLOCK' | 'FVG' | 'LIQUIDITY_POOL';
  direction: 'BULLISH' | 'BEARISH';
  price: number;
  distance: number; // percentage from current price
  confidence: number;
  age: number; // hours since creation
  mitigated: boolean;
  strength: number; // 0-100
  volume?: number; // for liquidity pools
}

export class POIMapComponent {
  private pois: POIEntry[] = [];

  constructor() {
    // Initialize with empty POI list
  }

  updateConfig(config: { pois: POIEntry[] }): void {
    // eslint-disable-next-line functional/immutable-data
    this.pois = config.pois;
  }

  render(): string[] {
    const lines: string[] = [];

    // Header
    // eslint-disable-next-line functional/immutable-data
    lines.push('Type      Price     Dist   Conf');

    // Sort POIs by distance (closest first)
    const sortedPOIs = [...this.pois].sort((a, b) => Math.abs(a.distance) - Math.abs(b.distance));

    // Display up to 8 POIs
    const displayPOIs = sortedPOIs.slice(0, 8);

    for (const poi of displayPOIs) {
      const line = this.formatPOILine(poi);
      // eslint-disable-next-line functional/immutable-data
      lines.push(line);
    }

    // Fill remaining lines if needed
    while (lines.length < 9) {
      // 1 header + 8 data lines
      // eslint-disable-next-line functional/immutable-data
      lines.push(''.padEnd(31));
    }

    return lines;
  }

  private formatPOILine(poi: POIEntry): string {
    const poiColor = this.getPOIColor(poi.distance, poi.confidence);
    const typeStr = this.formatPOIType(poi.type, poi.direction).padEnd(8);
    const priceStr = this.formatPrice(poi.price).padEnd(8);
    const distStr = this.formatDistance(poi.distance).padEnd(6);
    const confStr = `${poi.confidence.toFixed(0)}%`;

    return `${poiColor}${typeStr}\x1b[0m ${priceStr} ${distStr} ${confStr}`;
  }

  private formatPOIType(type: string, direction: string): string {
    const typeMap = {
      ORDER_BLOCK: 'OB',
      FVG: 'FVG',
      LIQUIDITY_POOL: 'LIQ',
    };

    const directionMap = {
      BULLISH: 'BULL',
      BEARISH: 'BEAR',
    };

    const shortType = typeMap[type as keyof typeof typeMap] || type.substring(0, 3);
    const shortDirection =
      directionMap[direction as keyof typeof directionMap] || direction.substring(0, 4);

    return `${shortType}-${shortDirection}`;
  }

  private formatPrice(price: number): string {
    if (price >= 1000) {
      return price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    } else if (price >= 1) {
      return price.toFixed(2);
    } else {
      return price.toFixed(4);
    }
  }

  private formatDistance(distance: number): string {
    const sign = distance >= 0 ? '+' : '';
    return `${sign}${distance.toFixed(1)}%`;
  }

  private getPOIColor(distance: number, confidence: number): string {
    // Color code by proximity (red < 0.5%, yellow < 2%)
    if (Math.abs(distance) < 0.5) {
      return confidence > 80 ? '\x1b[1m\x1b[31m' : '\x1b[31m'; // Red (very close)
    } else if (Math.abs(distance) < 2.0) {
      return confidence > 70 ? '\x1b[1m\x1b[33m' : '\x1b[33m'; // Yellow (close)
    } else {
      return '\x1b[37m'; // White (far)
    }
  }
}

export default POIMapComponent;
