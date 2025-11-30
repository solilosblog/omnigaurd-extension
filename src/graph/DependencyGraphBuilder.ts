import { CodebaseIndex } from "../core/WorkspaceIndexer";
import { DependencyResolver, DependencyNode } from "../core/DependencyResolver";
import * as path from "path";

export interface GraphNode {
  id: string;
  label: string;
  type: "entry" | "service" | "model" | "util" | "test" | "controller";
  layer: "infrastructure" | "application" | "domain" | "presentation";
  language: string;
  metrics: {
    loc: number;
    functions: number;
    classes: number;
    complexity: number;
    impactScore: number;
    centralityScore: number;
  };
}

export interface GraphEdge {
  from: string;
  to: string;
  type: "import" | "extends" | "implements" | "calls";
  weight: number;
}

export interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export class DependencyGraphBuilder {
  private index: CodebaseIndex;
  private dependencyResolver: DependencyResolver;

  constructor(index: CodebaseIndex, dependencyResolver: DependencyResolver) {
    this.index = index;
    this.dependencyResolver = dependencyResolver;
  }

  public buildGraph(): DependencyGraph {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const edgeSet = new Set<string>();

    for (const [filePath, analysis] of this.index.files) {
      const depNode = this.dependencyResolver.getDependencyNode(filePath);
      
      nodes.push({
        id: filePath,
        label: path.basename(filePath),
        type: this.determineType(filePath, analysis),
        layer: this.determineLayer(filePath),
        language: analysis.language,
        metrics: {
          loc: 0,
          functions: analysis.functions.length,
          classes: analysis.classes.length,
          complexity: analysis.functions.reduce((sum, f) => sum + f.complexity, 0),
          impactScore: depNode.impactScore,
          centralityScore: depNode.centralityScore,
        },
      });

      for (const dep of depNode.directImports) {
        const edgeKey = `${filePath}->${dep}`;
        if (!edgeSet.has(edgeKey)) {
          edges.push({
            from: filePath,
            to: dep,
            type: "import",
            weight: 1,
          });
          edgeSet.add(edgeKey);
        }
      }
    }

    return { nodes, edges };
  }

  private determineType(filePath: string, analysis: any): GraphNode["type"] {
    const fileName = path.basename(filePath).toLowerCase();
    const dirName = path.dirname(filePath).toLowerCase();

    if (fileName.includes("test") || fileName.includes("spec")) {
      return "test";
    }
    if (dirName.includes("controller") || dirName.includes("api")) {
      return "controller";
    }
    if (dirName.includes("service")) {
      return "service";
    }
    if (dirName.includes("model") || dirName.includes("entity")) {
      return "model";
    }
    if (dirName.includes("util") || dirName.includes("helper")) {
      return "util";
    }
    if (fileName.includes("index") || fileName.includes("main") || fileName.includes("app")) {
      return "entry";
    }

    return "service";
  }

  private determineLayer(filePath: string): GraphNode["layer"] {
    const dirName = path.dirname(filePath).toLowerCase();

    if (dirName.includes("controller") || dirName.includes("api") || dirName.includes("route")) {
      return "presentation";
    }
    if (dirName.includes("service") || dirName.includes("business")) {
      return "application";
    }
    if (dirName.includes("model") || dirName.includes("entity") || dirName.includes("domain")) {
      return "domain";
    }

    return "infrastructure";
  }

  public generateMermaid(graph: DependencyGraph): string {
    let mermaid = "graph TD\n";

    const nodeColors: Record<string, string> = {
      entry: "#ff6b6b",
      controller: "#4ecdc4",
      service: "#45b7d1",
      model: "#f7b731",
      util: "#5f27cd",
      test: "#00d2d3",
    };

    const limitedNodes = graph.nodes.slice(0, 50);
    const nodeIds = new Set(limitedNodes.map((n) => n.id));

    for (const node of limitedNodes) {
      const safeId = this.sanitizeId(node.id);
      mermaid += `    ${safeId}[${node.label}]\n`;
      mermaid += `    style ${safeId} fill:${nodeColors[node.type] || "#95a5a6"}\n`;
    }

    const limitedEdges = graph.edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to)).slice(0, 100);

    for (const edge of limitedEdges) {
      const fromId = this.sanitizeId(edge.from);
      const toId = this.sanitizeId(edge.to);
      mermaid += `    ${fromId} --> ${toId}\n`;
    }

    return mermaid;
  }

  private sanitizeId(id: string): string {
    return id.replace(/[^a-zA-Z0-9]/g, "_");
  }

  public generateTree(graph: DependencyGraph): string {
    const tree: string[] = [];
    const grouped = new Map<string, GraphNode[]>();

    for (const node of graph.nodes) {
      const dir = path.dirname(node.id);
      if (!grouped.has(dir)) {
        grouped.set(dir, []);
      }
      grouped.get(dir)!.push(node);
    }

    for (const [dir, nodes] of grouped) {
      tree.push(`📁 ${dir}/`);
      for (const node of nodes) {
        const icon = this.getNodeIcon(node.type);
        tree.push(`  ${icon} ${node.label} [${node.metrics.functions} functions, ${node.metrics.classes} classes]`);
      }
      tree.push("");
    }

    return tree.join("\n");
  }

  private getNodeIcon(type: GraphNode["type"]): string {
    const icons: Record<string, string> = {
      entry: "🚀",
      controller: "🎮",
      service: "⚙️",
      model: "📦",
      util: "🔧",
      test: "🧪",
    };
    return icons[type] || "📄";
  }

  public generateJSON(graph: DependencyGraph): object {
    return {
      dependencyGraph: {
        nodes: graph.nodes,
        edges: graph.edges,
      },
      metadata: {
        totalNodes: graph.nodes.length,
        totalEdges: graph.edges.length,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  public findPath(from: string, to: string, graph: DependencyGraph): string[] {
    const visited = new Set<string>();
    const path: string[] = [];

    const dfs = (current: string): boolean => {
      if (current === to) {
        path.push(current);
        return true;
      }

      visited.add(current);
      path.push(current);

      const outgoingEdges = graph.edges.filter((e) => e.from === current);
      for (const edge of outgoingEdges) {
        if (!visited.has(edge.to)) {
          if (dfs(edge.to)) {
            return true;
          }
        }
      }

      path.pop();
      return false;
    };

    dfs(from);
    return path;
  }
}