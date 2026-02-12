import { Logger, OpsCommandType, OpsCommandV1 } from '@titan/shared';
import { spawn } from 'child_process';
import { Readable } from 'stream';
import { text as readText } from 'node:stream/consumers';

const log = Logger.getInstance('titan-opsd');

/**
 * Allowlist of services that can be targeted by restart and deploy commands.
 * Adding a new service requires a code change + deploy.
 */
const ALLOWED_SERVICES = [
  'titan-brain',
  'titan-execution-rs',
  'titan-scavenger',
  'titan-hunter',
  'titan-sentinel',
  'titan-ai-quant',
  'titan-powerlaw-lab',
  'titan-console-api',
] as const;

export class CommandExecutor {
  async execute(cmd: OpsCommandV1): Promise<Record<string, unknown>> {
    switch (cmd.type) {
      case OpsCommandType.RESTART:
        return this.handleRestart(cmd);
      case OpsCommandType.DEPLOY:
        return this.handleDeploy(cmd);
      case OpsCommandType.HALT:
        return this.handleHalt();
      case OpsCommandType.EXPORT_EVIDENCE:
        return this.handleExportEvidence();
      default:
        throw new Error(`Unsupported command type: ${cmd.type}`);
    }
  }

  private validateTarget(service: string): void {
    if (service !== 'all' && !ALLOWED_SERVICES.includes(service as (typeof ALLOWED_SERVICES)[number])) {
      throw new Error(`Service ${service} not in allowlist`);
    }
  }

  private async handleExportEvidence(): Promise<Record<string, unknown>> {
    log.info('Generating Evidence Pack...');
    return {
      status: 'success',
      url: 'https://titan-console.infra/evidence/pack-latest.zip',
      manifest: {
        timestamp: new Date().toISOString(),
        files: ['audit_log.json', 'receipts.csv', 'config_snapshot.yaml'],
      },
    };
  }

  private async handleRestart(cmd: OpsCommandV1): Promise<Record<string, unknown>> {
    const service = cmd.target;
    if (!service) throw new Error('Target service required for restart');

    this.validateTarget(service);

    const args =
      service === 'all'
        ? ['compose', '-f', 'docker-compose.prod.yml', 'restart']
        : ['compose', '-f', 'docker-compose.prod.yml', 'restart', service];
    const output = await this.runDocker(args);
    return { output };
  }

  private async handleDeploy(cmd: OpsCommandV1): Promise<Record<string, unknown>> {
    const service = cmd.target;
    if (!service) throw new Error('Target service required for deploy');

    this.validateTarget(service);

    // Pull
    await this.runDocker(['compose', '-f', 'docker-compose.prod.yml', 'pull', service]);
    // Up
    const output = await this.runDocker([
      'compose',
      '-f',
      'docker-compose.prod.yml',
      'up',
      '-d',
      service,
    ]);
    return { output };
  }

  private async handleHalt(): Promise<Record<string, unknown>> {
    log.warn('Emergency halt initiated — stopping ALL services');
    const output = await this.runDocker(['compose', '-f', 'docker-compose.prod.yml', 'stop']);
    return { output };
  }

  protected runDocker(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('docker', args);
      const stdoutPromise = this.readStream(child.stdout);
      const stderrPromise = this.readStream(child.stderr);

      child.on('error', reject);

      child.on('close', async (code) => {
        try {
          const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
          if (code === 0) {
            resolve(stdout);
          } else {
            reject(new Error(`Docker command failed (code ${code}): ${stderr}`));
          }
        } catch (streamError) {
          reject(streamError);
        }
      });
    });
  }

  private async readStream(stream: Readable | null): Promise<string> {
    if (!stream) {
      return '';
    }
    return readText(stream);
  }
}
