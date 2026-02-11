import { RepoGraph } from './graph-builder';

export enum RiskTier {
  High = 'High',
  Medium = 'Medium',
  Low = 'Low',
}

export class DiffRiskClassifier {
  classify(
    files: string[],
    graph: RepoGraph,
  ): { tier: RiskTier; reasons: string[]; impactedNodes: string[] } {
    // 1. Identify directly changed nodes
    const directImpacts = files.reduce((acc, file) => {
      const match = Array.from(graph.nodes.keys()).find((nodeId) => file.startsWith(nodeId + '/'));
      return match ? new Set([...acc, match]) : acc;
    }, new Set<string>());

    // 2. Transitive Closure (Functional BFS)
    const getDependents = (target: string): string[] => {
      return Array.from(graph.nodes.entries())
        .filter(([_, node]) => node.dependencies.includes(target))
        .map(([id]) => id);
    };

    const expandImpacts = (
      currentImpacts: ReadonlySet<string>,
      currentReasons: readonly string[],
    ): { impacts: ReadonlySet<string>; reasons: readonly string[] } => {
      const expansions = Array.from(currentImpacts).flatMap((impact) =>
        getDependents(impact)
          .filter((d) => !currentImpacts.has(d))
          .map((d) => ({ node: d, reason: `Transitive: ${d} depends on ${impact}` })),
      );

      if (expansions.length === 0) {
        return { impacts: currentImpacts, reasons: currentReasons };
      }

      const nextImpacts = new Set([...currentImpacts, ...expansions.map((e) => e.node)]);
      const nextReasons = [...currentReasons, ...expansions.map((e) => e.reason)];

      return expandImpacts(nextImpacts, nextReasons);
    };

    const { impacts: finalImpactedNodes, reasons: transitiveReasons } = expandImpacts(
      directImpacts,
      [],
    );

    // 3. Assess Risk based on Impacted Nodes
    const impactAssessment = Array.from(finalImpactedNodes).reduce(
      (acc, nodeId) => {
        if (
          nodeId.startsWith('services/titan-execution-rs') ||
          nodeId.startsWith('packages/shared')
        ) {
          return {
            tier: RiskTier.High,
            reasons: [...acc.reasons, `High: Auto-escalation due to impact on ${nodeId}`],
          };
        }
        return acc;
      },
      { tier: RiskTier.Low as RiskTier, reasons: transitiveReasons as string[] },
    );

    // 4. File-specific Rules
    const fileAssessment = files.reduce((acc, file) => {
      if (file.startsWith('services/titan-execution-rs/')) {
        return {
          tier: RiskTier.High,
          reasons: [...acc.reasons, `High: Touch critical execution engine (${file})`],
        };
      }
      if (file.startsWith('packages/shared/')) {
        return {
          tier: RiskTier.High,
          reasons: [...acc.reasons, `High: Touch shared contracts/schemas (${file})`],
        };
      }
      if (file.endsWith('nats.conf')) {
        return {
          tier: RiskTier.High,
          reasons: [...acc.reasons, `High: Infra config change (${file})`],
        };
      }
      if (
        acc.tier !== RiskTier.High &&
        (file.startsWith('services/') || file.startsWith('packages/'))
      ) {
        return {
          tier: RiskTier.Medium,
          reasons: [...acc.reasons, `Medium: Code logic change (${file})`],
        };
      }
      return acc;
    }, impactAssessment);

    // 5. Default to Low if no specific reasons found
    if (fileAssessment.reasons.length === 0) {
      return {
        tier: RiskTier.Low,
        reasons: ['Low: Documentation or minor script change'],
        impactedNodes: Array.from(finalImpactedNodes),
      };
    }

    return { ...fileAssessment, impactedNodes: Array.from(finalImpactedNodes) };
  }
}
