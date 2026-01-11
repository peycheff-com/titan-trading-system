
export class MockAdapter {
    constructor() {
        this.positions = [];
        this.orders = [];
    }

    async testConnection() {
        return { success: true, message: 'Connected to Mock Exchange' };
    }

    async getAccount() {
        return {
            equity: 100000,
            available_balance: 50000,
            unrealized_pnl: 0
        };
    }

    async getPositions() {
        return this.positions;
    }

    async sendOrder(order) {
        // Simulate immediate fill
        const fillPrice = order.limit_price || 100000;
        
        // Update positions logic (simplified)
        const existing = this.positions.find(p => p.symbol === order.symbol);
        if (existing) {
            // For now, complex position merging is out of scope for mock, 
            // just assume new position or update size
            existing.size += order.size * (order.side === 'BUY' ? 1 : -1);
        } else {
            this.positions.push({
                symbol: order.symbol,
                side: order.side === 'BUY' ? 'LONG' : 'SHORT',
                size: order.size,
                entry_price: fillPrice,
                unrealized_pnl: 0,
                leverage: 1
            });
        }

        return {
            success: true,
            broker_order_id: `mock-ord-${Date.now()}`,
            orderId: `mock-ord-${Date.now()}`,
            status: 'FILLED',
            fill_price: fillPrice,
            executed_qty: order.size
        };
    }

    async closePosition(symbol) {
        this.positions = this.positions.filter(p => p.symbol !== symbol);
        return { success: true };
    }

    async closeAllPositions() {
        const count = this.positions.length;
        this.positions = [];
        return { success: true, closed_count: count };
    }
}
