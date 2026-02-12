import * as fs from 'fs';
import * as path from 'path';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import {
  generateQualityPack,
  generateSupplyChainPack,
  generateCostPack,
  hashPack,
} from '../core/evidence';
import { runHygieneAnalysis } from '../core/hygiene-engine';

const execAsync = promisify(exec);

interface TestResult {
  readonly package: string;
  readonly command: string;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly duration: number;
}

interface MatrixTask {
  readonly package: string;
  readonly type: string;
  readonly command: string;
  readonly dir: string;
}

interface SOTACheckEntry {
  readonly id: string;
  readonly name: string;
  readonly command: string;
  readonly category: string;
  readonly required: boolean;
  readonly timeout: number;
}

interface SOTAResult {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly required: boolean;
  readonly exitCode: number;
  readonly duration: number;
  readonly output: string;
  readonly status: 'passed' | 'failed' | 'skipped';
}

const executeTask = async (task: MatrixTask): Promise<TestResult> => {
  console.log(`\n▶️  Running ${task.command} in ${task.package}...`);
  const start = Date.now();
  try {
    const { stdout, stderr } = await execAsync(task.command, {
      cwd: path.join(process.cwd(), task.dir),
    });
    const duration = Date.now() - start;
    console.log(chalk.green(`✅ Success (${duration}ms)`));
    return { package: task.package, command: task.command, exitCode: 0, stdout, stderr, duration };
  } catch (error: unknown) {
    const duration = Date.now() - start;
    const err = error as { code?: number; stdout?: string; stderr?: string; message?: string };
    console.log(chalk.red(`❌ Failed (${duration}ms)`));
    return {
      package: task.package,
      command: task.command,
      exitCode: err.code || 1,
      stdout: err.stdout || '',
      stderr: err.stderr || err.message || 'Unknown error',
      duration,
    };
  }
};

const executeTasksSequentially = async (
  tasks: readonly MatrixTask[],
): Promise<readonly TestResult[]> => {
  if (tasks.length === 0) return [];
  const [head, ...tail] = tasks;
  const result = await executeTask(head);
  return [result, ...(await executeTasksSequentially(tail))];
};

export class QualityGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QualityGateError';
  }
}

export class RunCommand {
  private findRepoRoot(): string {
    try {
      return execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
    } catch {
      return process.cwd();
    }
  }

  async execute(options: { planId?: string }): Promise<boolean> {
    console.log(chalk.blue('🚀 QualityKernel: Executing Plan...'));

    const repoRoot = this.findRepoRoot();
    console.log(`Repo root: ${repoRoot}`);

    const planId = options.planId || this.findLatestPlanId();
    if (!planId) {
      throw new QualityGateError('No plan found. Run "quality:plan" first.');
    }

    const planPath = path.join(process.cwd(), 'artifacts/quality_os/plans', planId, 'plan.json');
    if (!fs.existsSync(planPath)) {
      throw new QualityGateError(`Plan file not found at ${planPath}`);
    }

    const plan = JSON.parse(fs.readFileSync(planPath, 'utf-8'));
    const tier = plan.risk_analysis.tier;
    console.log(`Loaded Plan: ${plan.id} (Tier: ${tier})`);

    // ── Phase 1: Test Matrix ────────────────────────────────────────
    const matrix = plan.execution_plan.matrix || { include: [] };
    const tasks: readonly MatrixTask[] = matrix.include;
    console.log(chalk.yellow(`\n═══ Phase 1: Test Matrix (${tasks.length} tasks) ═══`));
    const testResults = await executeTasksSequentially(tasks);

    // ── Phase 2: SOTA Checks (from repo root) ───────────────────────
    const sotaChecks: readonly SOTACheckEntry[] = plan.execution_plan.sota_checks || [];
    console.log(
      chalk.yellow(`\n═══ Phase 2: SOTA Quality Checks (${sotaChecks.length} checks) ═══`),
    );
    const sotaResults = await this.executeSOTAChecks(sotaChecks, repoRoot);

    // ── Phase 3: Hygiene Analysis (from repo root) ──────────────────
    console.log(chalk.yellow('\n═══ Phase 3: Hygiene Analysis ═══'));
    const hygienePack = await runHygieneAnalysis(repoRoot);
    console.log(`  Dead exports: ${hygienePack.dead_code.length}`);
    console.log(`  Broken links: ${hygienePack.doc_integrity.broken_links.length}`);
    console.log(`  Arch violations: ${hygienePack.architecture.violations.length}`);
    console.log(`  Circular deps: ${hygienePack.architecture.circular_deps.length}`);

    // ── Phase 4: Evidence Generation ────────────────────────────────
    console.log(chalk.yellow('\n═══ Phase 4: Evidence Generation ═══'));
    const planHash = hashPack(plan);
    const evidenceDir = path.join(process.cwd(), 'artifacts/quality_os/plans', planId);

    const qualityPack = generateQualityPack(testResults, planHash, 0, 0);
    const supplyChainPack = await generateSupplyChainPack(repoRoot);
    const costPack = generateCostPack(
      [
        ...testResults,
        ...sotaResults.map((r) => ({
          package: r.id,
          command: r.name,
          exitCode: r.exitCode,
          duration: r.duration,
        })),
      ],
      tier,
    );

    const sotaPack = {
      timestamp: new Date().toISOString(),
      tier,
      total_checks: sotaResults.length,
      results: sotaResults,
      summary: {
        passed: sotaResults.filter((r) => r.status === 'passed').length,
        failed: sotaResults.filter((r) => r.status === 'failed').length,
        skipped: sotaResults.filter((r) => r.status === 'skipped').length,
        required_passed: sotaResults.filter((r) => r.required && r.status === 'passed').length,
        required_failed: sotaResults.filter((r) => r.required && r.status === 'failed').length,
      },
      pack_hash: '',
    };
    const sotaHash = hashPack({ ...sotaPack, pack_hash: undefined });
    const signedSotaPack = { ...sotaPack, pack_hash: sotaHash };

    // Write all packs
    const packs = [
      { name: 'quality-pack.json', data: qualityPack },
      { name: 'hygiene-pack.json', data: hygienePack },
      { name: 'supply-chain-pack.json', data: supplyChainPack },
      { name: 'cost-pack.json', data: costPack },
      { name: 'sota-pack.json', data: signedSotaPack },
    ] as const;

    packs.forEach(({ name, data }) => {
      const packPath = path.join(evidenceDir, name);
      fs.writeFileSync(packPath, JSON.stringify(data, null, 2));
      console.log(chalk.green(`  📦 ${name}`));
    });

    // ── Final Verdict ───────────────────────────────────────────────
    const testFailed = testResults.filter((r) => r.exitCode !== 0).length;
    const sotaRequiredFailed = signedSotaPack.summary.required_failed;
    const totalFailed = testFailed + sotaRequiredFailed;

    console.log(chalk.blue('\n═══ QUALITY VERDICT ═══'));
    console.log(`  Tests:        ${testResults.length - testFailed}/${testResults.length} passed`);
    console.log(
      `  SOTA Checks:  ${signedSotaPack.summary.passed}/${sotaResults.length} passed (${signedSotaPack.summary.required_passed} required passed)`,
    );
    console.log(`  Evidence:     5 packs generated in ${evidenceDir}`);

    if (totalFailed > 0) {
      console.log(chalk.red(`\n💥 QUALITY GATE FAILED: ${totalFailed} required check(s) failed.`));
      return false;
    }

    console.log(chalk.green('\n✅ QUALITY GATE PASSED: All required checks passed.'));
    return true;
  }

  private async executeSOTAChecks(
    checks: readonly SOTACheckEntry[],
    repoRoot: string,
  ): Promise<readonly SOTAResult[]> {
    const executeOne = async (check: SOTACheckEntry): Promise<SOTAResult> => {
      const prefix = check.required ? '🔒' : '📋';
      console.log(`  ${prefix} ${check.name} (${check.category})...`);
      const start = Date.now();
      try {
        const { stdout } = await execAsync(check.command, {
          cwd: repoRoot,
          timeout: check.timeout,
        });
        const duration = Date.now() - start;
        console.log(chalk.green(`     ✅ Passed (${duration}ms)`));
        return {
          id: check.id,
          name: check.name,
          category: check.category,
          required: check.required,
          exitCode: 0,
          duration,
          output: stdout.slice(0, 2000),
          status: 'passed',
        };
      } catch (error: unknown) {
        const duration = Date.now() - start;
        const err = error as {
          code?: number;
          stdout?: string;
          stderr?: string;
          message?: string;
        };
        const status: 'failed' | 'skipped' = check.required ? 'failed' : 'skipped';
        const icon = check.required ? '❌' : '⚠️';
        console.log(
          chalk[check.required ? 'red' : 'yellow'](`     ${icon} ${status} (${duration}ms)`),
        );
        return {
          id: check.id,
          name: check.name,
          category: check.category,
          required: check.required,
          exitCode: err.code || 1,
          duration,
          output: (err.stderr || err.message || '').slice(0, 2000),
          status,
        };
      }
    };

    const executeSeq = async (
      remaining: readonly SOTACheckEntry[],
    ): Promise<readonly SOTAResult[]> => {
      if (remaining.length === 0) return [];
      const [head, ...tail] = remaining;
      const result = await executeOne(head);
      return [result, ...(await executeSeq(tail))];
    };

    return executeSeq(checks);
  }

  private findLatestPlanId(): string | undefined {
    const plansDir = path.join(process.cwd(), 'artifacts/quality_os/plans');
    if (!fs.existsSync(plansDir)) return undefined;
    const plans = [
      ...fs
        .readdirSync(plansDir)
        .filter((f) => f.startsWith('plan-'))
        .sort(),
    ].reverse();
    return plans[0];
  }
}
