/**
 * 20250101000001_initial_schema.js
 * Initial database schema migration using Knex
 * Requirements: 97.1-97.2
 */

export async function up(knex) {
  // Trades table
  await knex.schema.createTable('trades', (table) => {
    table.increments('trade_id').primary();
    table.string('signal_id', 100).notNullable();
    table.string('symbol', 20).notNullable();
    table.string('side', 10).notNullable();
    table.decimal('size', 18, 8).notNullable();
    table.decimal('entry_price', 18, 8).notNullable();
    table.decimal('stop_price', 18, 8);
    table.decimal('tp_price', 18, 8);
    table.decimal('fill_price', 18, 8);
    table.decimal('slippage_pct', 10, 6);
    table.integer('execution_latency_ms');
    table.integer('regime_state');
    table.integer('phase');
    table.timestamp('timestamp').notNullable();
  });

  // Positions table
  await knex.schema.createTable('positions', (table) => {
    table.increments('position_id').primary();
    table.string('symbol', 20).notNullable();
    table.string('side', 10).notNullable();
    table.decimal('size', 18, 8).notNullable();
    table.decimal('avg_entry', 18, 8).notNullable();
    table.decimal('current_stop', 18, 8);
    table.decimal('current_tp', 18, 8);
    table.decimal('unrealized_pnl', 18, 8);
    table.integer('regime_at_entry');
    table.integer('phase_at_entry');
    table.timestamp('opened_at').notNullable();
    table.timestamp('updated_at');
    table.timestamp('closed_at');
    table.decimal('close_price', 18, 8);
    table.decimal('realized_pnl', 18, 8);
    table.string('close_reason', 50);
  });

  // Regime snapshots table
  await knex.schema.createTable('regime_snapshots', (table) => {
    table.increments('snapshot_id').primary();
    table.timestamp('timestamp').notNullable();
    table.string('symbol', 20).notNullable();
    table.integer('regime_state');
    table.integer('trend_state');
    table.integer('vol_state');
    table.decimal('market_structure_score', 10, 2);
    table.string('model_recommendation', 20);
  });

  // System events table
  await knex.schema.createTable('system_events', (table) => {
    table.increments('event_id').primary();
    table.string('event_type', 50).notNullable();
    table.string('severity', 20).notNullable();
    table.text('description');
    table.text('context_json'); // Using text for SQLite compatibility
    table.timestamp('timestamp').notNullable();
  });

  // Create indexes for query performance (Requirements: 97.8)
  await knex.schema.table('trades', (table) => {
    table.index('timestamp', 'idx_trades_timestamp');
    table.index('symbol', 'idx_trades_symbol');
    table.index('signal_id', 'idx_trades_signal_id');
    table.index(['symbol', 'timestamp'], 'idx_trades_symbol_timestamp');
  });

  await knex.schema.table('positions', (table) => {
    table.index('symbol', 'idx_positions_symbol');
    table.index('opened_at', 'idx_positions_opened_at');
    table.index('closed_at', 'idx_positions_closed_at');
    table.index(['symbol', 'closed_at'], 'idx_positions_symbol_closed');
  });

  await knex.schema.table('regime_snapshots', (table) => {
    table.index('timestamp', 'idx_regime_timestamp');
    table.index('symbol', 'idx_regime_symbol');
    table.index(['symbol', 'timestamp'], 'idx_regime_symbol_timestamp');
  });

  await knex.schema.table('system_events', (table) => {
    table.index('timestamp', 'idx_events_timestamp');
    table.index('event_type', 'idx_events_type');
    table.index('severity', 'idx_events_severity');
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('system_events');
  await knex.schema.dropTableIfExists('regime_snapshots');
  await knex.schema.dropTableIfExists('positions');
  await knex.schema.dropTableIfExists('trades');
}
