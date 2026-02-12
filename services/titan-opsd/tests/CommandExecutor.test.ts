/* eslint-disable functional/no-let */
/* eslint-disable functional/immutable-data */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { OpsCommandType, type OpsCommandV1 } from '@titan/shared';

// We test CommandExecutor by creating a subclass that overrides runDocker
// to avoid needing to mock child_process at the ESM module level.

function createCommand(overrides: Partial<OpsCommandV1> = {}): OpsCommandV1 {
  return {
    v: 1,
    id: '00000000-0000-0000-0000-000000000001',
    ts: new Date().toISOString(),
    type: OpsCommandType.RESTART,
    target: 'titan-brain',
    meta: {
      initiator_id: 'operator-1',
      reason: 'test',
      signature: 'test-sig',
    },
    ...overrides,
  };
}

// Import the real module
const { CommandExecutor } = await import('../src/CommandExecutor.js');

// Subclass to intercept Docker calls
class TestableCommandExecutor extends CommandExecutor {
  public dockerCalls: string[][] = [];
  public dockerResult = '';
  public dockerShouldFail = false;
  public dockerFailMessage = 'Docker command failed';

  protected override runDocker(args: string[]): Promise<string> {
    this.dockerCalls.push(args);
    if (this.dockerShouldFail) {
      return Promise.reject(new Error(this.dockerFailMessage));
    }
    return Promise.resolve(this.dockerResult);
  }
}

describe('CommandExecutor', () => {
  let executor: TestableCommandExecutor;

  beforeEach(() => {
    executor = new TestableCommandExecutor();
    executor.dockerCalls = [];
    executor.dockerResult = 'ok';
    executor.dockerShouldFail = false;
  });

  describe('Restart', () => {
    it('should restart an allowed service', async () => {
      const cmd = createCommand({
        type: OpsCommandType.RESTART,
        target: 'titan-brain',
      });
      const result = await executor.execute(cmd);
      expect(result).toEqual({ output: 'ok' });
      expect(executor.dockerCalls).toHaveLength(1);
      expect(executor.dockerCalls[0]).toEqual([
        'compose',
        '-f',
        'docker-compose.prod.yml',
        'restart',
        'titan-brain',
      ]);
    });

    it('should restart all services when target is "all"', async () => {
      const cmd = createCommand({
        type: OpsCommandType.RESTART,
        target: 'all',
      });
      const result = await executor.execute(cmd);
      expect(result).toEqual({ output: 'ok' });
      expect(executor.dockerCalls[0]).toEqual([
        'compose',
        '-f',
        'docker-compose.prod.yml',
        'restart',
      ]);
    });

    it('should reject services not in the allowlist', async () => {
      const cmd = createCommand({
        type: OpsCommandType.RESTART,
        target: 'evil-service',
      });
      await expect(executor.execute(cmd)).rejects.toThrow('not in allowlist');
    });

    it('should reject restart without a target', async () => {
      const cmd = createCommand({
        type: OpsCommandType.RESTART,
        target: '',
      });
      await expect(executor.execute(cmd)).rejects.toThrow('Target service required');
    });
  });

  describe('Deploy', () => {
    it('should deploy an allowed service (pull + up -d)', async () => {
      const cmd = createCommand({
        type: OpsCommandType.DEPLOY,
        target: 'titan-brain',
      });
      const result = await executor.execute(cmd);
      expect(result).toEqual({ output: 'ok' });
      // Pull + Up = 2 Docker calls
      expect(executor.dockerCalls).toHaveLength(2);
    });

    it('should reject deploy for services not in allowlist', async () => {
      const cmd = createCommand({
        type: OpsCommandType.DEPLOY,
        target: 'attacker-service',
      });
      await expect(executor.execute(cmd)).rejects.toThrow('not in allowlist');
    });

    it('should reject deploy without a target', async () => {
      const cmd = createCommand({
        type: OpsCommandType.DEPLOY,
        target: '',
      });
      await expect(executor.execute(cmd)).rejects.toThrow('Target service required');
    });
  });

  describe('Halt', () => {
    it('should stop all services', async () => {
      const cmd = createCommand({
        type: OpsCommandType.HALT,
        target: 'all',
      });
      const result = await executor.execute(cmd);
      expect(result).toEqual({ output: 'ok' });
      expect(executor.dockerCalls[0]).toEqual([
        'compose',
        '-f',
        'docker-compose.prod.yml',
        'stop',
      ]);
    });
  });

  describe('Export Evidence', () => {
    it('should return evidence pack metadata', async () => {
      const cmd = createCommand({
        type: OpsCommandType.EXPORT_EVIDENCE,
        target: 'all',
      });
      const result = await executor.execute(cmd);
      expect(result).toHaveProperty('status', 'success');
      expect(result).toHaveProperty('url');
      expect(result).toHaveProperty('manifest');
    });
  });

  describe('Unsupported commands', () => {
    it('should throw for unsupported command types', async () => {
      const cmd = createCommand({
        type: OpsCommandType.CANCEL_ALL,
        target: 'all',
      });
      await expect(executor.execute(cmd)).rejects.toThrow('Unsupported command type');
    });
  });

  describe('Docker failures', () => {
    it('should propagate Docker command failure', async () => {
      executor.dockerShouldFail = true;
      executor.dockerFailMessage = 'container not found';
      const cmd = createCommand({
        type: OpsCommandType.RESTART,
        target: 'titan-brain',
      });
      await expect(executor.execute(cmd)).rejects.toThrow('container not found');
    });
  });
});
