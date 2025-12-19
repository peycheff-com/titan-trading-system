/**
 * Tests for the complete monitoring system
 */

import { getMonitoringOrchestrator, resetMonitoringOrchestrator } from '../../MonitoringOrchestrator';

describe('MonitoringSystem', () => {
  afterEach(() => {
    resetMonitoringOrchestrator();
  });

  test('should initialize monitoring orchestrator', () => {
    const orchestrator = getMonitoringOrchestrator();
    expect(orchestrator).toBeDefined();
  });

  test('should get system status', async () => {
    const orchestrator = getMonitoringOrchestrator();
    const status = await orchestrator.getSystemStatus();
    
    expect(status).toHaveProperty('monitoring');
    expect(status).toHaveProperty('alerting');
    expect(status).toHaveProperty('retention');
    expect(status.monitoring).toHaveProperty('active');
    expect(status.alerting).toHaveProperty('enabled');
    expect(status.retention).toHaveProperty('running');
  });

  test('should get health summary', () => {
    const orchestrator = getMonitoringOrchestrator();
    const health = orchestrator.getHealthSummary();
    
    expect(health).toHaveProperty('status');
    expect(health).toHaveProperty('issues');
    expect(health).toHaveProperty('recommendations');
    expect(['healthy', 'warning', 'critical']).toContain(health.status);
  });

  test('should start and stop monitoring', async () => {
    const orchestrator = getMonitoringOrchestrator();
    
    // Start monitoring
    await orchestrator.startMonitoring();
    
    const statusAfterStart = await orchestrator.getSystemStatus();
    expect(statusAfterStart.monitoring.active).toBe(true);
    
    // Stop monitoring
    orchestrator.stopMonitoring();
    
    const statusAfterStop = await orchestrator.getSystemStatus();
    expect(statusAfterStop.monitoring.active).toBe(false);
  });

  test('should trigger test alert', async () => {
    const orchestrator = getMonitoringOrchestrator();
    
    // This should not throw
    await expect(orchestrator.triggerTestAlert(
      'Test Alert',
      'Test message',
      'info'
    )).resolves.not.toThrow();
  });
});