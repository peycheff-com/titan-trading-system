import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execSync } from 'child_process';
import { glob } from 'glob';

// --- Deterministic Hashing ---

export const hashPack = (data: unknown): string => {
  const canonical =
    data !== null && typeof data === 'object' && !Array.isArray(data)
      ? JSON.stringify(data, Object.keys(data).sort(), 0)
      : JSON.stringify(data);
  return crypto.createHash('sha256').update(canonical).digest('hex');
};

// --- QualityPack ---

interface TestResultInput {
  readonly package: string;
  readonly command: string;
  readonly exitCode: number;
  readonly duration: number;
}

export interface QualityPack {
  readonly meta: {
    readonly timestamp: string;
    readonly commit_sha: string;
    readonly plan_hash: string;
    readonly toolchain: {
      readonly node: string;
      readonly npm: string;
      readonly rust: string;
    };
  };
  readonly results: readonly {
    readonly test_suite: string;
    readonly passed: number;
    readonly failed: number;
    readonly duration_ms: number;
  }[];
  readonly lint_status: {
    readonly passed: boolean;
    readonly errors: number;
    readonly warnings: number;
  };
  readonly determinism_vectors: {
    readonly pack_hash: string;
  };
}

const getToolVersion = (cmd: string): string => {
  try {
    return execSync(cmd, { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
};

export const generateQualityPack = (
  results: readonly TestResultInput[],
  planHash: string,
  lintErrors: number,
  lintWarnings: number,
): QualityPack => {
  const commitSha = getToolVersion('git rev-parse HEAD');

  const testResults = results.map((r) => ({
    test_suite: r.package,
    passed: r.exitCode === 0 ? 1 : 0,
    failed: r.exitCode !== 0 ? 1 : 0,
    duration_ms: r.duration,
  }));

  const pack: Omit<QualityPack, 'determinism_vectors'> = {
    meta: {
      timestamp: new Date().toISOString(),
      commit_sha: commitSha,
      plan_hash: planHash,
      toolchain: {
        node: getToolVersion('node --version'),
        npm: getToolVersion('npm --version'),
        rust: getToolVersion('rustc --version'),
      },
    },
    results: testResults,
    lint_status: {
      passed: lintErrors === 0,
      errors: lintErrors,
      warnings: lintWarnings,
    },
  };

  return {
    ...pack,
    determinism_vectors: { pack_hash: hashPack(pack) },
  };
};

// --- SupplyChainPack ---

export interface SupplyChainPack {
  readonly audits: {
    readonly npm: {
      readonly vulnerabilities: number;
      readonly high: number;
      readonly critical: number;
    };
  };
  readonly pinning: {
    readonly github_actions: readonly {
      readonly file: string;
      readonly action: string;
      readonly usage: string;
      readonly status: 'pinned_sha' | 'unpinned_tag' | 'mutable_ref';
    }[];
  };
  readonly sboms: readonly {
    readonly component: string;
    readonly format: string;
    readonly path: string;
    readonly hash: string;
  }[];
}

const checkActionPinning = async (
  rootDir: string,
): Promise<SupplyChainPack['pinning']['github_actions']> => {
  const workflowFiles = await glob('.github/workflows/*.yml', {
    cwd: rootDir,
    absolute: true,
  });

  const usesRegex = /uses:\s+(\S+)/g;
  const shaRegex = /^[a-f0-9]{40}$/;

  return workflowFiles.reduce(
    (
      acc: readonly {
        file: string;
        action: string;
        usage: string;
        status: 'pinned_sha' | 'unpinned_tag' | 'mutable_ref';
      }[],
      file: string,
    ) => {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const relFile = path.relative(rootDir, file);
        const matches = [...content.matchAll(usesRegex)];

        const entries = matches
          .filter(([, usage]) => !usage.startsWith('./'))
          .map(([, usage]) => {
            const parts = usage.split('@');
            const ref = parts[1] || '';
            const status: 'pinned_sha' | 'unpinned_tag' | 'mutable_ref' = shaRegex.test(
              ref.split(' ')[0],
            )
              ? 'pinned_sha'
              : ref.startsWith('v')
                ? 'unpinned_tag'
                : 'mutable_ref';

            return {
              file: relFile,
              action: parts[0],
              usage,
              status,
            };
          });

        return [...acc, ...entries];
      } catch {
        return acc;
      }
    },
    [],
  );
};

export const generateSupplyChainPack = async (rootDir: string): Promise<SupplyChainPack> => {
  const pinning = await checkActionPinning(rootDir);

  // npm audit
  const npmAudit = (() => {
    try {
      const output = execSync('npm audit --json 2>/dev/null', {
        encoding: 'utf-8',
        cwd: rootDir,
      });
      const parsed = JSON.parse(output);
      const meta = parsed.metadata?.vulnerabilities || {};
      return {
        vulnerabilities: meta.total || 0,
        high: meta.high || 0,
        critical: meta.critical || 0,
      };
    } catch {
      return { vulnerabilities: 0, high: 0, critical: 0 };
    }
  })();

  return {
    audits: { npm: npmAudit },
    pinning: { github_actions: pinning },
    sboms: [],
  };
};

// --- CostPack ---

export interface CostPack {
  readonly runtime: {
    readonly total_minutes: number;
    readonly jobs: readonly {
      readonly name: string;
      readonly minutes: number;
      readonly status: string;
    }[];
  };
  readonly caching: {
    readonly hit_rate_pct: number;
    readonly hits: number;
    readonly misses: number;
    readonly size_saved_mb: number;
  };
  readonly justification: {
    readonly risk_tier: string;
    readonly skipped_checks: readonly string[];
  };
}

export const generateCostPack = (
  results: readonly TestResultInput[],
  riskTier: string,
): CostPack => {
  const jobs = results.map((r) => ({
    name: r.package,
    minutes: Math.round((r.duration / 60000) * 100) / 100,
    status: r.exitCode === 0 ? 'passed' : 'failed',
  }));

  const totalMinutes = jobs.reduce((sum, j) => sum + j.minutes, 0);

  return {
    runtime: {
      total_minutes: Math.round(totalMinutes * 100) / 100,
      jobs,
    },
    caching: {
      hit_rate_pct: 0,
      hits: 0,
      misses: 0,
      size_saved_mb: 0,
    },
    justification: {
      risk_tier: riskTier,
      skipped_checks: riskTier === 'Low' ? ['full-integration', 'e2e'] : [],
    },
  };
};
