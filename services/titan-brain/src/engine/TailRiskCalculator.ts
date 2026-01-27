export class TailRiskCalculator {
    calculateAPTR(positions: any[]): number {
        return 0.5;
    }

    isRiskCritical(aptr: number): boolean {
        return false;
    }
}
