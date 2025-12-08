import { Batch } from "./BatchManager";
import { DependencyGraph, DependencyGraphBuilder } from "../graph/DependencyGraphBuilder";
import { FileAnalysis } from "../codeAnalysis/astParser";
import { SemgrepAnalyzer, SemgrepAnalysisResult } from "../codeAnalysis/semgrepAnalyzer";

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
  semgrepAnalysis?: {
    summary: string;
    totalFindings: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    topFindings: Array<{
      check_id: string;
      path: string;
      line: number;
      severity: string;
      message: string;
      category?: string;
    }>;
  };
  conversationContext?: {
    previousBatches: number[];
    keyTakeaways: string[];
    userGoal: string;
  };
}

export class ContextBuilder {
  private graphBuilder: DependencyGraphBuilder;
  private semgrepAnalyzer: SemgrepAnalyzer | null = null;

  constructor(graphBuilder: DependencyGraphBuilder, workspaceRoot?: string) {
    this.graphBuilder = graphBuilder;
    if (workspaceRoot) {
      this.semgrepAnalyzer = new SemgrepAnalyzer(workspaceRoot);
    }
  }

  public async buildContext(
    batch: Batch,
    graph: DependencyGraph,
    conversationHistory?: ConversationContext
  ): Promise<CodebaseContext> {
    // Run Semgrep analysis on batch files
    let semgrepAnalysis = undefined;
    if (this.semgrepAnalyzer) {
      const analysis = await this.semgrepAnalyzer.analyzeFiles(batch.filePaths);
      if (analysis) {
        semgrepAnalysis = {
          summary: analysis.summary,
          totalFindings: analysis.totalFindings,
          criticalCount: analysis.criticalCount,
          highCount: analysis.highCount,
          mediumCount: analysis.mediumCount,
          lowCount: analysis.lowCount,
          topFindings: this.semgrepAnalyzer.getTopFindings(analysis, 10).map(f => ({
            check_id: f.check_id,
            path: f.path,
            line: f.start.line,
            severity: f.extra.severity,
            message: f.extra.message,
            category: f.extra.metadata.category,
          })),
        };
      }
      console.log(`Semgrep analysis completed for batch ${analysis ? "with findings" : "with no findings"}.`);
    }

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
      semgrepAnalysis,
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