import { DiffRiskClassifier, RiskTier } from '../../src/core/risk-classifier';
import { RepoGraph, GraphNode } from '../../src/core/graph-builder';

describe('DiffRiskClassifier', () => {
  const classifier = new DiffRiskClassifier();

  const buildGraph = (nodes: readonly GraphNode[]): RepoGraph => {
    let graph = new RepoGraph();
    for (const node of nodes) {
      graph = graph.addNode(node);
    }
    return graph;
  };

  const sharedNode: GraphNode = {
    id: 'packages/shared',
    type: 'package',
    dependencies: [],
    tags: ['node'],
    metadata: { scripts: ['build', 'test'] },
  };

  const brainNode: GraphNode = {
    id: 'services/titan-brain',
    type: 'service',
    dependencies: ['packages/shared'],
    tags: ['node'],
    metadata: { scripts: ['build', 'test'] },
  };

  const executionNode: GraphNode = {
    id: 'services/titan-execution-rs',
    type: 'service',
    dependencies: [],
    tags: ['rust'],
  };

  const consoleNode: GraphNode = {
    id: 'apps/titan-console',
    type: 'service',
    dependencies: ['packages/shared'],
    tags: ['node'],
    metadata: { scripts: ['build', 'test'] },
  };

  const graph = buildGraph([sharedNode, brainNode, executionNode, consoleNode]);

  it('classifies execution-rs changes as High risk', () => {
    const result = classifier.classify(['services/titan-execution-rs/src/main.rs'], graph);
    expect(result.tier).toBe(RiskTier.High);
  });

  it('classifies shared package changes as High risk', () => {
    const result = classifier.classify(['packages/shared/src/index.ts'], graph);
    expect(result.tier).toBe(RiskTier.High);
  });

  it('classifies nats.conf changes as High risk', () => {
    const result = classifier.classify(['config/nats.conf'], graph);
    expect(result.tier).toBe(RiskTier.High);
  });

  it('classifies service changes as Medium risk', () => {
    const result = classifier.classify(['services/titan-brain/src/engine.ts'], graph);
    expect(result.tier).toBe(RiskTier.Medium);
  });

  it('classifies doc-only changes as Low risk', () => {
    const result = classifier.classify(['docs/README.md'], graph);
    expect(result.tier).toBe(RiskTier.Low);
  });

  it('identifies transitive impacts', () => {
    const result = classifier.classify(['packages/shared/src/schemas.ts'], graph);
    // shared is a dependency of brainNode and consoleNode
    expect(result.impactedNodes).toContain('packages/shared');
    expect(result.impactedNodes).toContain('services/titan-brain');
    expect(result.impactedNodes).toContain('apps/titan-console');
  });

  it('returns empty reasons for doc changes', () => {
    const result = classifier.classify(['docs/README.md'], graph);
    expect(result.reasons).toEqual(['Low: Documentation or minor script change']);
  });

  it('handles empty file list', () => {
    const result = classifier.classify([], graph);
    expect(result.tier).toBe(RiskTier.Low);
  });
});
