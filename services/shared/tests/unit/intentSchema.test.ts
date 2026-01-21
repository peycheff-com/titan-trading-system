import { validateIntentPayload } from '../../src/schemas/intentSchema';

describe('Intent schema validation', () => {
  it('accepts payload with t_signal', () => {
    const result = validateIntentPayload({
      schema_version: '1.0.0',
      signal_id: 'sig-1',
      source: 'brain',
      symbol: 'BTCUSDT',
      direction: 1,
      type: 'BUY_SETUP',
      entry_zone: [50000, 50500],
      stop_loss: 49000,
      take_profits: [52000],
      size: 100,
      status: 'VALIDATED',
      t_signal: Date.now(),
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('accepts legacy timestamp and defaults arrays', () => {
    const result = validateIntentPayload({
      signal_id: 'sig-2',
      symbol: 'ETHUSDT',
      direction: -1,
      type: 'SELL_SETUP',
      size: 50,
      status: 'PENDING',
      timestamp: Date.now(),
    });

    expect(result.valid).toBe(true);
    expect(result.data?.entry_zone).toEqual([]);
    expect(result.data?.take_profits).toEqual([]);
    expect(result.data?.t_signal).toBeGreaterThan(0);
  });

  it('rejects missing t_signal and timestamp', () => {
    const result = validateIntentPayload({
      signal_id: 'sig-3',
      symbol: 'SOLUSDT',
      direction: 1,
      type: 'BUY_SETUP',
      size: 10,
      status: 'PENDING',
    });

    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('t_signal');
  });
});
