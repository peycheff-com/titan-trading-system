import { glob } from 'glob';
import * as fs from 'fs';
import * as path from 'path';

export interface GraphNode {
  readonly id: string;
  readonly type: 'service' | 'package' | 'config' | 'doc' | 'script';
  readonly dependencies: readonly string[];
  readonly tags: readonly string[];
  readonly metadata?: {
    readonly scripts?: readonly string[];
  };
}

export class RepoGraph {
  readonly nodes: ReadonlyMap<string, GraphNode>;

  constructor(nodes: ReadonlyMap<string, GraphNode> = new Map()) {
    this.nodes = nodes;
  }

  addNode(node: GraphNode): RepoGraph {
    return new RepoGraph(new Map([...Array.from(this.nodes.entries()), [node.id, node]]));
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }
}

export class RepoGraphBuilder {
  async build(rootDir: string): Promise<RepoGraph> {
    const initialGraph = new RepoGraph();

    // 1. First Pass: Index all nodes by package name
    const packageFiles = await glob('**/package.json', {
      cwd: rootDir,
      ignore: ['**/node_modules/**', '**/dist/**'],
    });

    const nameToPath: ReadonlyMap<string, string> = new Map(
      packageFiles
        .map((pkgFile) => {
          try {
            const fullPath = path.join(rootDir, pkgFile);
            const content = fs.readFileSync(fullPath, 'utf-8');
            const pkg = JSON.parse(content);
            const dirPath = path.dirname(pkgFile);
            return pkg.name ? ([pkg.name, dirPath] as const) : null;
          } catch {
            return null;
          }
        })
        .filter((entry): entry is readonly [string, string] => entry !== null),
    );

    // 2. Second Pass: Build Graph and Link Dependencies
    const graphWithPkgs = packageFiles.reduce(
      (g, pkgFile) => this.processNodePackage(rootDir, pkgFile, g, nameToPath),
      initialGraph,
    );

    // 3. Scan Rust crates (basic)
    const cargoFiles = await glob('**/Cargo.toml', {
      cwd: rootDir,
      ignore: ['**/target/**'],
    });

    const graphWithCargo = cargoFiles.reduce(
      (g, cargoFile) => this.processRustCrate(rootDir, cargoFile, g),
      graphWithPkgs,
    );

    // 4. Scan Key Configs
    return graphWithCargo.addNode({
      id: 'config/nats.conf',
      type: 'config',
      dependencies: [],
      tags: ['critical', 'infra'],
    });
  }

  private processNodePackage(
    rootDir: string,
    pkgFile: string,
    graph: RepoGraph,
    nameMap: ReadonlyMap<string, string>,
  ): RepoGraph {
    try {
      const fullPath = path.join(rootDir, pkgFile);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const pkg = JSON.parse(content);
      const dirPath = path.dirname(pkgFile);

      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

      const dependencies = Object.keys(allDeps)
        .filter((depName) => nameMap.has(depName))
        .map((depName) => nameMap.get(depName)!);

      return graph.addNode({
        id: dirPath,
        type: pkgFile.includes('services') ? 'service' : 'package',
        dependencies,
        tags: ['node'],
        metadata: {
          scripts: pkg.scripts ? Object.keys(pkg.scripts) : [],
        },
      });
    } catch {
      return graph;
    }
  }

  private processRustCrate(_rootDir: string, cargoFile: string, graph: RepoGraph): RepoGraph {
    const dirPath = path.dirname(cargoFile);
    return graph.addNode({
      id: dirPath,
      type: 'service',
      dependencies: [],
      tags: ['rust'],
    });
  }
}
