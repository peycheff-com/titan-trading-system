/**
 * overseer.js - CLI for TitanOverseer AI Agent
 * 
 * Usage: node scripts/overseer.js [days]
 * Default days: 7
 */

import 'dotenv/config';
import { DatabaseManager } from '../DatabaseManager.js';
import { TitanOverseer } from '../TitanOverseer.js';

async function main() {
    const args = process.argv.slice(2);
    const days = parseInt(args[0]) || 7;

    console.log('='.repeat(50));
    console.log('🕷️  TITAN OVERSEER - AI SYSTEM ANALYST');
    console.log('='.repeat(50));

    // 1. Init Database
    const dbParams = process.env.DATABASE_URL ? { type: 'postgres', url: process.env.DATABASE_URL } : { type: 'sqlite', url: './titan_execution.db' };
    const db = new DatabaseManager(dbParams);

    try {
        await db.initDatabase();

        // 2. Init AI Agent
        if (!process.env.GEMINI_API_KEY) {
            console.error('❌ Error: GEMINI_API_KEY is not set in environment.');
            process.exit(1);
        }

        const overseer = new TitanOverseer(db);

        // 3. Run Analysis
        console.log(`\n🔍 Analyzing performance for the last ${days} days...`);
        const report = await overseer.analyzeSystem(days);

        // 4. Report Results
        if (report.error) {
            console.error('❌ Analysis Failed:', report.error);
            if (report.raw_text) console.log('Raw output:', report.raw_text);
        } else {
            console.log('\n📊 ANALYSIS COMPLETE\n');
            console.log(JSON.stringify(report, null, 2));
        }

    } catch (err) {
        console.error('❌ Fatal Error:', err);
    } finally {
        await db.close();
    }
}

main();
