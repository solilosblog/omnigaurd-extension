import { CodebaseIndex } from "../core/WorkspaceIndexer";
import { DependencyResolver } from "../core/DependencyResolver";
import { FileAnalysis } from "../codeAnalysis/astParser";
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
    console.log("📊 DependencyGraphBuilder initialized with", index.files.size, "files");
  }

  public buildGraph(): DependencyGraph {
    console.log("🔨 Building dependency graph...");
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

    console.log(`✅ Graph built: ${nodes.length} nodes, ${edges.length} edges`);
    return { nodes, edges };
  }

  private determineType(filePath: string, analysis: any): GraphNode["type"] {
  const fileName = path.basename(filePath).toLowerCase();
  const dirName = path.dirname(filePath).toLowerCase();
  
  console.log(`🏷️ Determining type for: ${fileName}`);
  console.log(`   Directory: ${dirName}`);

  if (fileName.includes("test") || fileName.includes("spec")) {
    console.log(`   ✓ Type: test`);
    return "test";
  }
  
  if (fileName.includes("application") || fileName.includes("main") || fileName.includes("app.")) {
    console.log(`   ✓ Type: entry`);
    return "entry";
  }
  
  if (dirName.includes("controller") || fileName.includes("controller")) {
    console.log(`   ✓ Type: controller`);
    return "controller";
  }
  
  if (dirName.includes("service") || fileName.includes("service")) {
    console.log(`   ✓ Type: service`);
    return "service";
  }
  
  if (dirName.includes("model") || fileName.includes("model") || 
      dirName.includes("entity") || fileName.includes("entity") ||
      fileName.includes("request") || fileName.includes("response") ||
      fileName.includes("context")) {
    console.log(`   ✓ Type: model`);
    return "model";
  }
  
  if (dirName.includes("util") || dirName.includes("helper") || 
      fileName.includes("util") || fileName.includes("helper") ||
      fileName.includes("tracker") || fileName.includes("enricher")) {
    console.log(`   ✓ Type: util`);
    return "util";
  }

  console.log(`   ✓ Type: service (default)`);
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

  public generateMermaidWithClusters(graph: DependencyGraph): string {
  console.log("🎨 Generating Mermaid diagram with clusters...");
  
  let mermaid = "graph TB\n";

  const nodeColors: Record<string, string> = {
    entry: "#ff6b6b",
    controller: "#4ecdc4",
    service: "#45b7d1",
    model: "#f7b731",
    util: "#5f27cd",
    test: "#00d2d3",
  };

  // Group nodes by package/directory
  const groups = new Map<string, GraphNode[]>();
  
  for (const node of graph.nodes) {
    const dirName = path.dirname(node.id);
    const packageName = dirName.split('/').pop() || 'root';
    
    if (!groups.has(packageName)) {
      groups.set(packageName, []);
    }
    groups.get(packageName)!.push(node);
  }

  console.log(`📦 Found ${groups.size} packages`);

  const nodeIdMap = new Map<string, string>();
  let nodeIndex = 0;

  // Generate subgraphs for each package
  for (const [packageName, nodes] of groups) {
    if (nodes.length === 0) continue;
    
    mermaid += `\n    subgraph ${packageName.replace(/[^a-zA-Z0-9]/g, '_')}["📁 ${packageName}"]\n`;
    
    for (const node of nodes) {
      const safeId = `node${nodeIndex}`;
      nodeIdMap.set(node.id, safeId);
      nodeIndex++;
      
      const label = node.label.replace(/\.java$/, '').replace(/"/g, '\\"');
      const functions = node.metrics.functions;
      const classes = node.metrics.classes;
      
      let enhancedLabel = `${label}`;
      if (functions > 0) enhancedLabel += `\\n⚡${functions}`;
      if (classes > 0) enhancedLabel += ` 📦${classes}`;
      
      mermaid += `        ${safeId}["${enhancedLabel}"]\n`;
      mermaid += `        style ${safeId} fill:${nodeColors[node.type] || "#95a5a6"},stroke:#fff,stroke-width:2px,color:#fff\n`;
    }
    
    mermaid += `    end\n`;
  }

  // Add edges
  mermaid += `\n`;
  for (const edge of graph.edges) {
    if (edge.from === edge.to) continue;
    
    const fromId = nodeIdMap.get(edge.from);
    const toId = nodeIdMap.get(edge.to);
    
    if (fromId && toId) {
      mermaid += `    ${fromId} --> ${toId}\n`;
    }
  }

  console.log("✅ Mermaid diagram with clusters generated");
  return mermaid;
}

  public generateMermaid(graph: DependencyGraph): string {
  console.log("🎨 Generating Mermaid diagram...");
  
  let mermaid = "graph TB\n";

  const nodeColors: Record<string, string> = {
    entry: "#ff6b6b",
    controller: "#4ecdc4",
    service: "#45b7d1",
    model: "#f7b731",
    util: "#5f27cd",
    test: "#00d2d3",
  };

  const maxNodes = 50;
  const maxEdges = 100;
  
  const sortedNodes = graph.nodes
    .sort((a, b) => b.metrics.centralityScore - a.metrics.centralityScore)
    .slice(0, maxNodes);
  
  const nodeIds = new Set(sortedNodes.map((n) => n.id));

  console.log(`📋 Rendering ${sortedNodes.length} nodes`);

  const nodeIdMap = new Map<string, string>();
  
  sortedNodes.forEach((node, index) => {
    const safeId = `node${index}`;
    nodeIdMap.set(node.id, safeId);
    
    const label = node.label.replace(/\.java$/, '').replace(/"/g, '\\"');
    const shortLabel = label.length > 25 ? label.substring(0, 22) + "..." : label;
    
    // Add metadata to label
    const functions = node.metrics.functions;
    const classes = node.metrics.classes;
    const complexity = node.metrics.complexity;
    
    let enhancedLabel = `${shortLabel}`;
    if (functions > 0 || classes > 0) {
      enhancedLabel += `\\n`;
      if (classes > 0) enhancedLabel += `📦${classes} `;
      if (functions > 0) enhancedLabel += `⚡${functions}`;
      if (complexity > 10) enhancedLabel += ` 🔴${complexity}`;
    }
    
    mermaid += `    ${safeId}["${enhancedLabel}"]\n`;
    mermaid += `    style ${safeId} fill:${nodeColors[node.type] || "#95a5a6"},stroke:#fff,stroke-width:3px,color:#fff\n`;
    
    console.log(`  Node ${index}: ${node.label} (${node.type}) -> ${nodeColors[node.type]} | Functions: ${functions}, Classes: ${classes}, Complexity: ${complexity}`);
  });

  const relevantEdges = graph.edges
    .filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to) && e.from !== e.to)
    .slice(0, maxEdges);

  console.log(`🔗 Rendering ${relevantEdges.length} edges (filtered out self-loops)`);

  for (const edge of relevantEdges) {
    const fromId = nodeIdMap.get(edge.from);
    const toId = nodeIdMap.get(edge.to);
    
    if (fromId && toId) {
      // Add edge labels for import count
      mermaid += `    ${fromId} -->|uses| ${toId}\n`;
      console.log(`  Edge: ${path.basename(edge.from)} -> ${path.basename(edge.to)}`);
    }
  }

  console.log("✅ Mermaid diagram generated");
  console.log("--- MERMAID DIAGRAM ---");
  console.log(mermaid);
  console.log("--- END DIAGRAM ---");

  return mermaid;
}

  private sanitizeId(id: string): string {
    return "node_" + id.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 50);
  }

  public generateTree(graph: DependencyGraph): string {
    console.log("🌳 Generating tree structure...");
    
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

    const treeStr = tree.join("\n");
    console.log("✅ Tree structure generated");
    console.log("--- TREE STRUCTURE ---");
    console.log(treeStr);
    console.log("--- END TREE ---");

    return treeStr;
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
    console.log("📄 Generating JSON metadata...");
    
    const json = {
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

    console.log("✅ JSON metadata generated");
    return json;
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