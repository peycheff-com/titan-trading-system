/**
 * Active Trade Component
 * Displays current trade information according to Requirement 8.3
 *
 * Requirements 8.3: WHEN displaying active trade THEN the System SHALL show:
 * - Narrative with Daily bias and 4H location
 * - Setup with POI type and price
 * - Confirmation with session event and CVD status
 * - Execution with fill price
 * - Target with weak high/low
 */

import { SessionType, TrendState } from '../types';

export interface ActiveTradeData {
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  leverage: number;

  // Narrative: Daily bias + 4H location
  narrative: {
    dailyBias: TrendState;
    h4Location: 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM';
  };

  // Setup: POI type + price
  setup: {
    type: 'OB' | 'FVG' | 'LIQ_POOL';
    price: number;
    confidence: number;
  };

  // Confirmation: session event + CVD status
  confirmation: {
    sessionEvent: 'JUDAS_SWING' | 'KILLZONE_ENTRY' | 'SESSION_OPEN';
    session: SessionType;
    cvdStatus: 'ABSORPTION' | 'DISTRIBUTION' | 'NEUTRAL';
    rsScore: number;
  };

  // Execution: fill price
  execution: {
    fillPrice: number;
    slippage: number;
    timestamp: number;
  };

  // Target: weak high/low
  targets: {
    weakHigh?: number; // For SHORT positions
    weakLow?: number; // For LONG positions
    stopLoss: number;
    takeProfit: number;
    breakeven: boolean;
    trailingActive: boolean;
  };

  // Additional display data
  pnl: number;
  rValue: number;
  timeInTrade: number;
}

export class ActiveTradeComponent {
  private trade: ActiveTradeData | null = null;

  constructor() {
    // No constructor parameters needed
  }

  updateConfig(config: { trade: ActiveTradeData | null }): void {
    this.trade = config.trade;
  }

  /**
   * Render the Active Trade component according to Requirement 8.3
   * Shows: Narrative, Setup, Confirmation, Execution, Target
   */
  render(): string[] {
    const lines: string[] = [];

    if (this.trade) {
      // Header with symbol, side, and R value
      const rColor = this.trade.rValue >= 0 ? '\x1b[32m' : '\x1b[31m';
      const pnlColor = this.trade.pnl >= 0 ? '\x1b[32m' : '\x1b[31m';

      lines.push(
        `\x1b[1m${this.trade.symbol} ${this.trade.side}\x1b[0m ${rColor}${this.formatRValue(this.trade.rValue)}\x1b[0m`
      );

      // Narrative: Daily bias + 4H location (Requirement 8.3)
      const narrativeText = this.formatNarrative(this.trade.narrative);
      lines.push(`📖 Narrative: ${narrativeText}`);

      // Setup: POI type + price (Requirement 8.3)
      const setupText = this.formatSetup(this.trade.setup);
      lines.push(`🎯 Setup: ${setupText}`);

      // Confirmation: session event + CVD status (Requirement 8.3)
      const confirmationText = this.formatConfirmation(this.trade.confirmation);
      lines.push(`✅ Confirmation: ${confirmationText}`);

      // Execution: fill price (Requirement 8.3)
      const executionText = this.formatExecution(this.trade.execution);
      lines.push(`⚡ Execution: ${executionText}`);

      // Target: weak high/low (Requirement 8.3)
      const targetText = this.formatTarget(this.trade.targets, this.trade.side);
      lines.push(`🎯 Target: ${targetText}`);

      // P&L and additional info
      lines.push(`💰 P&L: ${pnlColor}${this.formatCurrency(this.trade.pnl)}\x1b[0m`);
      lines.push(`⏱️  Time: ${this.formatTimeInTrade(this.trade.timeInTrade)}`);
    } else {
      lines.push('\x1b[2mNo active trade\x1b[0m');
      lines.push('');
      lines.push('Waiting for A+ Alignment...');
      lines.push('• Daily bias alignment');
      lines.push('• 4H Premium/Discount');
      lines.push('• 15m MSS trigger');
      lines.push('• CVD absorption');
      lines.push('• Killzone session');
    }

    // Ensure consistent height (9 lines total)
    while (lines.length < 9) {
      lines.push('');
    }

    return lines;
  }

  /**
   * Format narrative: Daily bias + 4H location
   */
  private formatNarrative(narrative: ActiveTradeData['narrative']): string {
    const biasColor =
      narrative.dailyBias === 'BULL'
        ? '\x1b[32m'
        : narrative.dailyBias === 'BEAR'
          ? '\x1b[31m'
          : '\x1b[33m';

    const locationColor =
      narrative.h4Location === 'DISCOUNT'
        ? '\x1b[32m'
        : narrative.h4Location === 'PREMIUM'
          ? '\x1b[31m'
          : '\x1b[33m';

    return `${biasColor}${narrative.dailyBias}\x1b[0m in ${locationColor}${narrative.h4Location}\x1b[0m`;
  }

  /**
   * Format setup: POI type + price
   */
  private formatSetup(setup: ActiveTradeData['setup']): string {
    const typeDisplay =
      setup.type === 'OB'
        ? 'Order Block'
        : setup.type === 'FVG'
          ? 'Fair Value Gap'
          : 'Liquidity Pool';

    const confidenceColor =
      setup.confidence >= 80 ? '\x1b[32m' : setup.confidence >= 60 ? '\x1b[33m' : '\x1b[31m';

    return `${typeDisplay} @ ${this.formatPrice(setup.price)} ${confidenceColor}(${setup.confidence}%)\x1b[0m`;
  }

  /**
   * Format confirmation: session event + CVD status
   */
  private formatConfirmation(confirmation: ActiveTradeData['confirmation']): string {
    const eventDisplay =
      confirmation.sessionEvent === 'JUDAS_SWING'
        ? 'Judas Swing'
        : confirmation.sessionEvent === 'KILLZONE_ENTRY'
          ? 'Killzone Entry'
          : 'Session Open';

    const cvdColor =
      confirmation.cvdStatus === 'ABSORPTION'
        ? '\x1b[32m'
        : confirmation.cvdStatus === 'DISTRIBUTION'
          ? '\x1b[31m'
          : '\x1b[33m';

    return `${eventDisplay} | ${cvdColor}${confirmation.cvdStatus}\x1b[0m`;
  }

  /**
   * Format execution: fill price
   */
  private formatExecution(execution: ActiveTradeData['execution']): string {
    const slippageColor =
      Math.abs(execution.slippage) <= 0.1
        ? '\x1b[32m'
        : Math.abs(execution.slippage) <= 0.2
          ? '\x1b[33m'
          : '\x1b[31m';

    return `Fill ${this.formatPrice(execution.fillPrice)} ${slippageColor}(${execution.slippage >= 0 ? '+' : ''}${execution.slippage.toFixed(3)}%)\x1b[0m`;
  }

  /**
   * Format target: weak high/low
   */
  private formatTarget(targets: ActiveTradeData['targets'], side: 'LONG' | 'SHORT'): string {
    const weakLevel = side === 'LONG' ? targets.weakLow : targets.weakHigh;
    const weakLevelText = weakLevel
      ? `Weak ${side === 'LONG' ? 'Low' : 'High'} ${this.formatPrice(weakLevel)}`
      : 'No weak level';

    const stopText = `SL ${this.formatPrice(targets.stopLoss)}`;
    const targetText = `TP ${this.formatPrice(targets.takeProfit)}`;

    const statusText = targets.breakeven
      ? '\x1b[32m[BE]\x1b[0m'
      : targets.trailingActive
        ? '\x1b[33m[TRAIL]\x1b[0m'
        : '';

    return `${weakLevelText} | ${stopText} → ${targetText} ${statusText}`;
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

  private formatCurrency(value: number): string {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  private formatRValue(rValue: number): string {
    const sign = rValue >= 0 ? '+' : '';
    return `${sign}${rValue.toFixed(1)}R`;
  }

  private formatTimeInTrade(timeMs: number): string {
    const hours = Math.floor(timeMs / (1000 * 60 * 60));
    const minutes = Math.floor((timeMs % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }
}

export default ActiveTradeComponent;
