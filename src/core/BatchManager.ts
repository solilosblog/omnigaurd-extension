import { CodebaseIndex } from "./WorkspaceIndexer";
import { DependencyResolver } from "./DependencyResolver";
import { FileAnalysis } from "../codeAnalysis/astParser";
import * as path from "path";

export interface Batch {
  id: number;
  name: string;
  description: string;
  files: FileAnalysis[];
  filePaths: string[];
  layer: "models" | "services" | "controllers" | "tests" | "utils" | "mixed";
  tokenEstimate: number;
  dependencies: {
    requires: number[];
    requiredBy: number[];
  };
}

export interface BatchOptions {
  maxFilesPerBatch: number;
  respectLayers: boolean;
  prioritizeByComplexity: boolean;
}

export class BatchManager {
  private batches: Batch[];
  private dependencyResolver: DependencyResolver;

  constructor(dependencyResolver: DependencyResolver) {
    this.batches = [];
    this.dependencyResolver = dependencyResolver;
  }

  public createBatches(index: CodebaseIndex, options: BatchOptions): Batch[] {
    const filesByLayer = this.groupFilesByLayer(index);
    this.batches = [];
    let batchId = 1;

    const layerOrder: Array<"models" | "utils" | "services" | "controllers" | "tests"> = 
      ["models", "utils", "services", "controllers", "tests"];

    for (const layer of layerOrder) {
      const layerFiles = filesByLayer.get(layer) || [];
      
      if (layerFiles.length === 0) {
        continue;
      }

      const layerBatches = this.createBatchesForLayer(
        layerFiles,
        layer,
        batchId,
        options.maxFilesPerBatch
      );

      this.batches.push(...layerBatches);
      batchId += layerBatches.length;
    }

    this.calculateBatchDependencies();

    return this.batches;
  }

  private groupFilesByLayer(index: CodebaseIndex): Map<string, Array<[string, FileAnalysis]>> {
    const filesByLayer = new Map<string, Array<[string, FileAnalysis]>>();

    filesByLayer.set("models", []);
    filesByLayer.set("utils", []);
    filesByLayer.set("services", []);
    filesByLayer.set("controllers", []);
    filesByLayer.set("tests", []);

    for (const [filePath, analysis] of index.files) {
      const layer = this.determineLayer(filePath, analysis);
      const layerArray = filesByLayer.get(layer) || [];
      layerArray.push([filePath, analysis]);
      filesByLayer.set(layer, layerArray);
    }

    return filesByLayer;
  }

  private determineLayer(filePath: string, analysis: FileAnalysis): string {
    const fileName = path.basename(filePath).toLowerCase();
    const dirName = path.dirname(filePath).toLowerCase();

    if (fileName.includes("test") || fileName.includes("spec")) {
      return "tests";
    }

    if (dirName.includes("model") || dirName.includes("entity") || dirName.includes("domain")) {
      return "models";
    }

    if (dirName.includes("util") || dirName.includes("helper") || dirName.includes("common")) {
      return "utils";
    }

    if (dirName.includes("service") || dirName.includes("business")) {
      return "services";
    }

    if (dirName.includes("controller") || dirName.includes("api") || dirName.includes("route")) {
      return "controllers";
    }

    if (analysis.classes.length > 0 && analysis.functions.length < 3) {
      return "models";
    }

    return "mixed";
  }

  private createBatchesForLayer(
    files: Array<[string, FileAnalysis]>,
    layer: string,
    startId: number,
    maxFilesPerBatch: number
  ): Batch[] {
    const batches: Batch[] = [];
    const chunks: Array<Array<[string, FileAnalysis]>> = [];

    for (let i = 0; i < files.length; i += maxFilesPerBatch) {
      chunks.push(files.slice(i, i + maxFilesPerBatch));
    }

    chunks.forEach((chunk, index) => {
      const batchFiles = chunk.map(([_, analysis]) => analysis);
      const filePaths = chunk.map(([filePath, _]) => filePath);

      batches.push({
        id: startId + index,
        name: `${layer.charAt(0).toUpperCase() + layer.slice(1)} Layer - Batch ${index + 1}`,
        description: `${batchFiles.length} files from ${layer} layer`,
        files: batchFiles,
        filePaths,
        layer: layer as any,
        tokenEstimate: this.estimateTokens(batchFiles),
        dependencies: {
          requires: [],
          requiredBy: [],
        },
      });
    });

    return batches;
  }

  private estimateTokens(files: FileAnalysis[]): number {
    return files.reduce((total, file) => {
      const funcTokens = file.functions.length * 50;
      const classTokens = file.classes.length * 30;
      const importTokens = file.imports.length * 10;
      return total + funcTokens + classTokens + importTokens + 100;
    }, 0);
  }

  private calculateBatchDependencies(): void {
    for (let i = 0; i < this.batches.length; i++) {
      const batch = this.batches[i];
      
      for (let j = 0; j < i; j++) {
        const prevBatch = this.batches[j];
        
        if (this.batchDependsOn(batch, prevBatch)) {
          batch.dependencies.requires.push(prevBatch.id);
          prevBatch.dependencies.requiredBy.push(batch.id);
        }
      }
    }
  }

  private batchDependsOn(batch: Batch, otherBatch: Batch): boolean {
    for (const filePath of batch.filePaths) {
      const depNode = this.dependencyResolver.getDependencyNode(filePath);
      
      for (const dep of depNode.directImports) {
        if (otherBatch.filePaths.includes(dep)) {
          return true;
        }
      }
    }

    return false;
  }

  public getNextBatch(currentBatchId: number): Batch | null {
    const nextBatch = this.batches.find((b) => b.id === currentBatchId + 1);
    return nextBatch || null;
  }

  public canProceedToNext(currentBatchId: number): boolean {
    const nextBatch = this.getNextBatch(currentBatchId);
    if (!nextBatch) {
      return false;
    }

    return nextBatch.dependencies.requires.every((reqId) => reqId <= currentBatchId);
  }

  public getBatchSummary(batch: Batch): string {
    return `Batch ${batch.id}/${this.batches.length}: ${batch.name} - ${batch.files.length} files, ~${Math.round(batch.tokenEstimate / 100) / 10}K tokens`;
  }

  public getTotalBatches(): number {
    return this.batches.length;
  }

  public getBatch(batchId: number): Batch | null {
    return this.batches.find((b) => b.id === batchId) || null;
  }

  public getAllBatches(): Batch[] {
    return this.batches;
  }
}