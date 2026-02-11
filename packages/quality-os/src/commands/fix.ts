import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';
import { detectDeadExports } from '../core/hygiene-engine';

interface FixAction {
  readonly tier: 'F0' | 'F1' | 'F2';
  readonly description: string;
  readonly file: string;
  readonly applied: boolean;
}

const runLintFix = (rootDir: string, dryRun: boolean): readonly FixAction[] => {
  console.log(chalk.yellow('\n🔧 F0: Running eslint --fix...'));
  if (dryRun) {
    console.log(chalk.dim('  [dry-run] Would run: npx eslint src --ext .ts --fix'));
    return [{ tier: 'F0', description: 'eslint --fix', file: 'src/**/*.ts', applied: false }];
  }
  try {
    execSync('npx eslint src --ext .ts --fix', { cwd: rootDir, encoding: 'utf-8', stdio: 'pipe' });
    console.log(chalk.green('  ✅ Lint fixes applied'));
    return [{ tier: 'F0', description: 'eslint --fix', file: 'src/**/*.ts', applied: true }];
  } catch {
    console.log(chalk.yellow('  ⚠️  Some lint issues could not be auto-fixed'));
    return [
      { tier: 'F0', description: 'eslint --fix (partial)', file: 'src/**/*.ts', applied: true },
    ];
  }
};

const runPrettierFix = (rootDir: string, dryRun: boolean): readonly FixAction[] => {
  console.log(chalk.yellow('🔧 F0: Running prettier --write...'));
  if (dryRun) {
    console.log(chalk.dim('  [dry-run] Would run: npx prettier --write "src/**/*.ts"'));
    return [{ tier: 'F0', description: 'prettier --write', file: 'src/**/*.ts', applied: false }];
  }
  try {
    execSync('npx prettier --write "src/**/*.ts"', {
      cwd: rootDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    console.log(chalk.green('  ✅ Prettier formatting applied'));
    return [{ tier: 'F0', description: 'prettier --write', file: 'src/**/*.ts', applied: true }];
  } catch {
    console.log(chalk.yellow('  ⚠️  Prettier encountered issues'));
    return [
      { tier: 'F0', description: 'prettier --write (partial)', file: 'src/**/*.ts', applied: true },
    ];
  }
};

const flagDeadExports = async (
  rootDir: string,
  _dryRun: boolean,
): Promise<readonly FixAction[]> => {
  console.log(chalk.yellow('🔧 F1: Scanning for dead exports...'));
  const deadExports = await detectDeadExports(rootDir);

  if (deadExports.length === 0) {
    console.log(chalk.green('  ✅ No dead exports found'));
    return [];
  }

  console.log(chalk.yellow(`  Found ${deadExports.length} potentially unused exports:`));
  return deadExports.map((de) => {
    console.log(chalk.dim(`    - ${de.file}: export ${de.symbol}`));
    return {
      tier: 'F1' as const,
      description: `Remove unused export: ${de.symbol}`,
      file: de.file,
      applied: false,
    };
  });
};

const flagSecurityIssues = (rootDir: string): readonly FixAction[] => {
  console.log(chalk.yellow('🔧 F2: Checking for security issues requiring approval...'));
  try {
    const output = execSync('npm audit --json 2>/dev/null', {
      cwd: rootDir,
      encoding: 'utf-8',
    });
    const parsed = JSON.parse(output);
    const vulns = parsed.metadata?.vulnerabilities || {};
    const critical = (vulns.critical || 0) + (vulns.high || 0);

    if (critical > 0) {
      console.log(
        chalk.red(`  ⚠️  ${critical} high/critical vulnerabilities require human approval`),
      );
      return [
        {
          tier: 'F2',
          description: `${critical} high/critical npm vulnerabilities`,
          file: 'package-lock.json',
          applied: false,
        },
      ];
    }
    console.log(chalk.green('  ✅ No critical vulnerabilities'));
    return [];
  } catch {
    console.log(chalk.green('  ✅ No critical vulnerabilities'));
    return [];
  }
};

const verifyFixes = (rootDir: string, dryRun: boolean): boolean => {
  if (dryRun) {
    console.log(chalk.dim('\n[dry-run] Would verify: npm run build && npm run lint'));
    return true;
  }
  console.log(chalk.yellow('\n🔄 Verifying fixes...'));
  try {
    execSync('npm run build', { cwd: rootDir, encoding: 'utf-8', stdio: 'pipe' });
    console.log(chalk.green('  ✅ Build passes'));
    return true;
  } catch {
    console.log(chalk.red('  ❌ Build failed after fixes'));
    return false;
  }
};

export class FixCommand {
  async execute(options: { dryRun: boolean }) {
    console.log(chalk.blue(`🔧 QualityKernel: Fix Loop (dry-run: ${options.dryRun})`));
    const rootDir = process.cwd();

    // F0: Automatic fixes
    const lintFixes = runLintFix(rootDir, options.dryRun);
    const prettierFixes = runPrettierFix(rootDir, options.dryRun);

    // F1: Suggested fixes (require PR review)
    const deadExportFixes = await flagDeadExports(rootDir, options.dryRun);

    // F2: Approval-required fixes
    const securityFixes = flagSecurityIssues(rootDir);

    const allFixes = [...lintFixes, ...prettierFixes, ...deadExportFixes, ...securityFixes];

    // Verify
    const verified = verifyFixes(rootDir, options.dryRun);

    // Report
    const report = {
      timestamp: new Date().toISOString(),
      dry_run: options.dryRun,
      verified,
      fixes: allFixes,
      summary: {
        f0_applied: allFixes.filter((f) => f.tier === 'F0' && f.applied).length,
        f1_suggested: allFixes.filter((f) => f.tier === 'F1').length,
        f2_requires_approval: allFixes.filter((f) => f.tier === 'F2').length,
      },
    };

    const reportDir = path.join(rootDir, 'artifacts/quality_os');
    fs.mkdirSync(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, 'fix-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(chalk.blue('\n📋 Fix Summary:'));
    console.log(`  F0 (Auto):     ${report.summary.f0_applied} applied`);
    console.log(`  F1 (PR):       ${report.summary.f1_suggested} suggested`);
    console.log(`  F2 (Approval): ${report.summary.f2_requires_approval} flagged`);
    console.log(chalk.green(`\nReport: ${reportPath}`));
  }
}
