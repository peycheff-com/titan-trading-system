import { RepoGraphBuilder, RepoGraph, GraphNode } from '../core/graph-builder';
import { DiffRiskClassifier } from '../core/risk-classifier';
import { getChecksForTier, groupByCategory, type RiskGate } from '../core/sota-registry';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface MatrixEntry {
  readonly package: string;
  readonly type: string;
  readonly command: string;
  readonly dir: string;
}

interface SOTAMatrixEntry {
  readonly id: string;
  readonly name: string;
  readonly command: string;
  readonly category: string;
  readonly required: boolean;
  readonly timeout: number;
}

interface TestMatrix {
  readonly include: readonly MatrixEntry[];
}

interface ExecutionPlan {
  readonly required_gates: readonly string[];
  readonly matrix: TestMatrix;
  readonly sota_checks: readonly SOTAMatrixEntry[];
  readonly sota_summary: {
    readonly total: number;
    readonly required: number;
    readonly by_category: Record<string, number>;
  };
}

export class PlanCommand {
  async execute(options: { base: string; head: string }) {
    console.log(`Analyzing diff between ${options.base} and ${options.head}`);

    // 1. Get Changed Files
    const diffOutput = execSync(`git diff --name-only ${options.base} ${options.head}`, {
      encoding: 'utf-8',
    });
    const changedFiles = diffOutput.split('\n').filter((f) => f.trim().length > 0);

    // 2. Build Graph
    const builder = new RepoGraphBuilder();
    const graph = await builder.build(process.cwd());

    // 3. Classify Risk
    const classifier = new DiffRiskClassifier();
    const { tier, reasons, impactedNodes } = classifier.classify(changedFiles, graph);

    console.log(`Risk Tier: ${tier}`);
    console.log(`Reasons:`);
    reasons.forEach((r: string) => console.log(` - ${r}`));

    // 4. Get SOTA checks for this tier
    const sotaChecks = getChecksForTier(tier as RiskGate);
    const grouped = groupByCategory(sotaChecks);

    console.log(`\nSOTA Checks (${sotaChecks.length} for tier ${tier}):`);
    Array.from(grouped.entries()).forEach(([cat, checks]) => {
      console.log(
        `  ${cat}: ${checks.length} checks (${checks.filter((c) => c.required).length} required)`,
      );
    });

    // 5. Build execution plan
    const executionPlan: ExecutionPlan = {
      required_gates: this.getGatesForTier(tier),
      matrix: this.generateTestMatrix(impactedNodes, graph),
      sota_checks: sotaChecks.map((c) => ({
        id: c.id,
        name: c.name,
        command: c.command,
        category: c.category,
        required: c.required,
        timeout: c.timeout,
      })),
      sota_summary: {
        total: sotaChecks.length,
        required: sotaChecks.filter((c) => c.required).length,
        by_category: Object.fromEntries(
          Array.from(grouped.entries()).map(([cat, checks]) => [cat, checks.length]),
        ),
      },
    };

    // 6. Generate Plan JSON
    const plan = {
      id: `plan-${Date.now()}`,
      trigger: 'manual',
      input_vectors: {
        base_sha: options.base,
        head_sha: options.head,
        changed_files: changedFiles,
      },
      risk_analysis: { tier, reasons },
      execution_plan: executionPlan,
    };

    const planDir = path.join(process.cwd(), 'artifacts/quality_os/plans', plan.id);
    fs.mkdirSync(planDir, { recursive: true });

    const planPath = path.join(planDir, 'plan.json');
    fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));

    console.log(`\nPlan generated at: ${planPath}`);
    console.log(`  Test tasks: ${executionPlan.matrix.include.length}`);
    console.log(
      `  SOTA checks: ${executionPlan.sota_checks.length} (${executionPlan.sota_summary.required} required)`,
    );
  }

  private getGatesForTier(tier: string): readonly string[] {
    switch (tier) {
      case 'High':
        return [
          'Gate A: PR Checks',
          'Gate B: Full Assurance',
          'Gate C: Nightly',
          'Gate D: Release',
        ];
      case 'Medium':
        return ['Gate A: PR Checks', 'Gate B: Full Assurance'];
      default:
        return ['Gate A: PR Checks (Lint Only)'];
    }
  }

  private generateTestMatrix(impactedNodes: readonly string[], graph: RepoGraph): TestMatrix {
    const nodeToEntry = (nodeId: string, node: GraphNode): MatrixEntry | null => {
      if (node.tags.includes('node')) {
        const hasTest = node.metadata?.scripts?.includes('test');
        if (!hasTest) return null;
        return { package: nodeId, type: 'node', command: 'npm test', dir: nodeId };
      }
      if (node.tags.includes('rust')) {
        return { package: nodeId, type: 'rust', command: 'cargo test', dir: nodeId };
      }
      return null;
    };

    const include = impactedNodes.reduce((acc: readonly MatrixEntry[], nodeId: string) => {
      const node = graph.nodes.get(nodeId);
      if (!node) return acc;
      const entry = nodeToEntry(nodeId, node);
      return entry ? [...acc, entry] : acc;
    }, []);

    return { include };
  }
}
