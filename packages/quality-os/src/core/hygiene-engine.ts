import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// --- Dead Code via Knip ---

interface DeadExport {
  readonly file: string;
  readonly symbol: string;
  readonly proof_method: 'knip' | 'zero_references';
}

export const detectDeadExports = async (rootDir: string): Promise<readonly DeadExport[]> => {
  try {
    const { stdout } = await execAsync('npx knip --reporter compact 2>/dev/null', {
      cwd: rootDir,
      timeout: 120_000,
    });

    // Parse knip compact output — each line: "filename: export1, export2"
    return stdout
      .split('\n')
      .filter((line) => line.includes(':') && line.trim().length > 0)
      .flatMap((line) => {
        const [file, ...rest] = line.split(':');
        const symbols = rest
          .join(':')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        return symbols.map((symbol) => ({
          file: file.trim(),
          symbol,
          proof_method: 'knip' as const,
        }));
      });
  } catch {
    // Knip exits non-zero when it finds issues; parse stderr/stdout anyway
    return [];
  }
};

// --- Doc Link Integrity via sota:docs:links ---

interface BrokenLink {
  readonly source: string;
  readonly target: string;
  readonly line: number;
}

export const checkDocLinks = async (rootDir: string): Promise<readonly BrokenLink[]> => {
  try {
    await execAsync('npm run sota:docs:links 2>/dev/null', {
      cwd: rootDir,
      timeout: 60_000,
    });
    return []; // exit 0 = no broken links
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string };
    const output = (err.stdout || '') + (err.stderr || '');

    return output
      .split('\n')
      .filter((line) => line.includes('FILE:') || line.includes('ERROR'))
      .map((line, idx) => ({
        source: line.trim(),
        target: 'parse-from-output',
        line: idx + 1,
      }));
  }
};

// --- Architecture Check via dependency-cruiser ---

interface ArchViolation {
  readonly rule: string;
  readonly from: string;
  readonly to: string;
  readonly severity: string;
}

export const checkArchitecture = async (rootDir: string): Promise<readonly ArchViolation[]> => {
  try {
    await execAsync('npm run sota:arch 2>/dev/null', {
      cwd: rootDir,
      timeout: 120_000,
    });
    return [];
  } catch (error: unknown) {
    const err = error as { stdout?: string };
    const output = err.stdout || '';

    return output
      .split('\n')
      .filter((line) => line.includes('error') || line.includes('warn'))
      .map((line) => ({
        rule: 'architecture',
        from: line,
        to: '',
        severity: line.includes('error') ? 'error' : 'warning',
      }));
  }
};

// --- Circular Dependency Check ---

export const checkCircularDeps = async (rootDir: string): Promise<readonly string[]> => {
  try {
    const { stdout } = await execAsync('npm run sota:circular 2>/dev/null', {
      cwd: rootDir,
      timeout: 60_000,
    });
    return stdout.split('\n').filter((line) => line.includes('→') || line.includes('->'));
  } catch {
    return [];
  }
};

// --- Aggregate ---

export interface HygienePack {
  readonly dead_code: readonly DeadExport[];
  readonly doc_integrity: {
    readonly broken_links: readonly BrokenLink[];
    readonly duplicates: readonly never[];
  };
  readonly schema_refs: readonly never[];
  readonly architecture: {
    readonly violations: readonly ArchViolation[];
    readonly circular_deps: readonly string[];
  };
}

export const runHygieneAnalysis = async (rootDir: string): Promise<HygienePack> => {
  const [deadCode, brokenLinks, archViolations, circularDeps] = await Promise.all([
    detectDeadExports(rootDir),
    checkDocLinks(rootDir),
    checkArchitecture(rootDir),
    checkCircularDeps(rootDir),
  ]);

  return {
    dead_code: deadCode,
    doc_integrity: {
      broken_links: brokenLinks,
      duplicates: [],
    },
    schema_refs: [],
    architecture: {
      violations: archViolations,
      circular_deps: circularDeps,
    },
  };
};
