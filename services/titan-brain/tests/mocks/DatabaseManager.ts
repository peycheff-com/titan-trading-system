export class DatabaseManager {
    constructor(config: any) {}
    async connect() {}
    async disconnect() {}
    async query(text: string, params?: any[]) {
        return { rows: [] };
    }
    async transaction(callback: any) {
        return callback(this);
    }
}
