/**
 * Margin Shock Simulator
 * Simulates extreme market conditions to test portfolio resilience
 *
 * Scenarios:
 * 1. Margin Requirement Double (Exchange Policy Change)
 * 2. Funding Rate Flip (Positive -> Negative)
 * 3. Basis Widening (Spot/Perp dislocation)
 */

import { Position } from "../types/index.js";

export interface StressResult {
    survived: boolean;
    liquidationPrice: number;
    marginUsage: number;
    pnlImpact: number;
}

export class MarginShockSimulator {
    /**
     * Simulate a shock to margin requirements
     * Common scenario during high volatility (e.g. exchange moves from 5% to 10% maintenance)
     */
    static simulateMarginIncrease(
        position: Position,
        multiplier: number,
        accountEquity: number,
    ): StressResult {
        // Assume standard maintenance margin unless specified
        const maintenanceMarginRate = 0.05; // 5%
        const shockedRate = maintenanceMarginRate * multiplier;

        // Focus on Perp Leg for margin requirements (Short Perp)
        const perpValue = Math.abs(position.perpSize * position.perpEntry);
        const requiredMargin = perpValue * shockedRate;
        const marginUsage = accountEquity > 0
            ? requiredMargin / accountEquity
            : 1.0;

        return {
            survived: marginUsage < 0.8, // 80% liquidation buffer
            liquidationPrice: this.calculateLiquidationPrice(
                position,
                accountEquity,
                shockedRate,
            ),
            marginUsage,
            pnlImpact: 0,
        };
    }

    /**
     * Simulate a Funding Rate Flip
     * Impact on Basis Trade Yield
     */
    static simulateFundingFlip(
        position: Position,
        currentRate: number,
        newRate: number,
        durationHours: number,
    ): number {
        // Funding applies to Perp Notional
        const perpValue = Math.abs(position.perpSize * position.perpEntry);

        // Rates are usually 8h
        const intervals = durationHours / 8;

        const expectedYield = perpValue * currentRate * intervals;
        const shockedYield = perpValue * newRate * intervals;

        return shockedYield - expectedYield; // Net PnL Impact
    }

    private static calculateLiquidationPrice(
        pos: Position,
        equity: number,
        maintenanceRate: number,
    ): number {
        // Simplified Liq Price calculation for Short Perp
        // Start with Perp Entry
        // For Short: Liq Price = Entry + (Collateral / Size)
        // Collateral available for this position approx Equity allocated

        const size = Math.abs(pos.perpSize);
        if (size === 0) return 0;

        const maintenanceValue = size * pos.perpEntry * maintenanceRate;
        const buffer = equity - maintenanceValue;

        // Short liquidation is above entry
        return pos.perpEntry + (buffer / size);
    }
}
