import { Batch } from "./BatchManager";
import { DependencyGraph, DependencyGraphBuilder } from "../graph/DependencyGraphBuilder";
import { FileAnalysis } from "../codeAnalysis/astParser";

export interface ConversationContext {
  completedBatches: number[];
  insights: string[];
  goal: string;
}

export interface CodebaseContext {
  mode: "batch" | "single" | "full";
  batchNumber?: number;
  totalBatches?: number;
  graph: {
    mermaid: string;
    tree: string;
    metadata: object;
  };
  files: Array<{
    path: string;
    language: string;
    role: string;
    summary: object;
    code: string;
    dependencies: {
      imports: string[];
      importedBy: string[];
      transitive: string[];
    };
  }>;
  conversationContext?: {
    previousBatches: number[];
    keyTakeaways: string[];
    userGoal: string;
  };
}

export class ContextBuilder {
  private graphBuilder: DependencyGraphBuilder;

  constructor(graphBuilder: DependencyGraphBuilder) {
    this.graphBuilder = graphBuilder;
  }

  public async buildContext(
    batch: Batch,
    graph: DependencyGraph,
    conversationHistory?: ConversationContext
  ): Promise<CodebaseContext> {
    return {
      mode: "batch",
      batchNumber: batch.id,
      totalBatches: batch.dependencies.requiredBy.length + batch.dependencies.requires.length,
      graph: {
        mermaid: this.graphBuilder.generateMermaidWithClusters(graph),
        tree: this.graphBuilder.generateTree(graph),
        metadata: this.graphBuilder.generateJSON(graph),
      },
      files: batch.files.map((file, index) => ({
        path: batch.filePaths[index],
        language: file.language,
        role: this.determineRole(file),
        summary: this.buildSummary(file),
        code: this.getCodeWithDetail(file, batch.layer),
        dependencies: {
          imports: file.imports,
          importedBy: [],
          transitive: [],
        },
      })),
      conversationContext: conversationHistory
        ? {
            previousBatches: conversationHistory.completedBatches,
            keyTakeaways: conversationHistory.insights,
            userGoal: conversationHistory.goal,
          }
        : undefined,
    };
  }

  private determineRole(file: FileAnalysis): string {
    if (file.classes.length > 0) {
      return "class-based";
    }
    if (file.functions.length > 5) {
      return "utility";
    }
    return "module";
  }

  private buildSummary(file: FileAnalysis): object {
    return {
      totalFunctions: file.functions.length,
      totalClasses: file.classes.length,
      totalImports: file.imports.length,
      avgComplexity:
        file.functions.length > 0
          ? file.functions.reduce((sum, f) => sum + f.complexity, 0) / file.functions.length
          : 0,
    };
  }

  private getCodeWithDetail(file: FileAnalysis, layer: string): string {
    if (layer === "models") {
      return this.extractSignatures(file);
    }
    
    return this.extractSummary(file);
  }

  private extractSignatures(file: FileAnalysis): string {
    let result = "";
    
    if (file.classes.length > 0) {
      result += `Classes: ${file.classes.join(", ")}\n\n`;
    }

    result += "Functions:\n";
    for (const func of file.functions) {
      result += `- ${func.signature}\n`;
    }

    return result;
  }

  private extractSummary(file: FileAnalysis): string {
    return `File contains ${file.functions.length} functions and ${file.classes.length} classes`;
  }
}