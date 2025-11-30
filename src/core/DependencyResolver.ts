import { FileAnalysis } from "../codeAnalysis/astParser";
import { CodebaseIndex } from "./WorkspaceIndexer";

export interface DependencyNode {
  file: string;
  directImports: string[];
  transitiveImports: TransitiveDependency[];
  importedBy: string[];
  transitiveImportedBy: TransitiveDependency[];
  circularDeps: CircularDependency[];
  impactScore: number;
  centralityScore: number;
}

export interface TransitiveDependency {
  level: number;
  files: string[];
  path: string[];
}

export interface CircularDependency {
  cycle: string[];
  severity: "warning" | "error";
}

export class DependencyResolver {
  private index: CodebaseIndex;
  private dependencyMap: Map<string, Set<string>>;
  private reverseDependencyMap: Map<string, Set<string>>;

  constructor(index: CodebaseIndex) {
    this.index = index;
    this.dependencyMap = new Map();
    this.reverseDependencyMap = new Map();
    this.buildDependencyMaps();
  }

  private buildDependencyMaps(): void {
    for (const [filePath, analysis] of this.index.files) {
      const deps = new Set<string>();
      
      for (const imp of analysis.imports) {
        const resolvedPath = this.resolveImport(imp, filePath);
        if (resolvedPath) {
          deps.add(resolvedPath);
          
          if (!this.reverseDependencyMap.has(resolvedPath)) {
            this.reverseDependencyMap.set(resolvedPath, new Set());
          }
          this.reverseDependencyMap.get(resolvedPath)!.add(filePath);
        }
      }
      
      this.dependencyMap.set(filePath, deps);
    }
  }

  private resolveImport(importStatement: string, currentFile: string): string | null {
    const importMatch = importStatement.match(/['"](.+?)['"]/);
    if (!importMatch) {
      return null;
    }

    const importPath = importMatch[1];
    
    for (const [filePath] of this.index.files) {
      if (filePath.includes(importPath) || filePath.endsWith(importPath + ".ts") || 
          filePath.endsWith(importPath + ".js") || filePath.endsWith(importPath + ".java") ||
          filePath.endsWith(importPath + ".py")) {
        return filePath;
      }
    }

    return null;
  }

  public getDependencyNode(filePath: string): DependencyNode {
    const directImports = Array.from(this.dependencyMap.get(filePath) || []);
    const importedBy = Array.from(this.reverseDependencyMap.get(filePath) || []);

    return {
      file: filePath,
      directImports,
      transitiveImports: this.getTransitiveDependencies(filePath, 3),
      importedBy,
      transitiveImportedBy: this.getReverseTransitiveDependencies(filePath, 3),
      circularDeps: this.detectCircularDependencies(filePath),
      impactScore: this.calculateImpactScore(filePath),
      centralityScore: this.calculateCentralityScore(filePath),
    };
  }

  private getTransitiveDependencies(filePath: string, maxDepth: number): TransitiveDependency[] {
    const result: TransitiveDependency[] = [];
    const visited = new Set<string>([filePath]);
    
    for (let level = 1; level <= maxDepth; level++) {
      const levelDeps: string[] = [];
      const paths: string[][] = [];
      
      this.traverseDependencies(filePath, level, visited, [], levelDeps, paths);
      
      if (levelDeps.length > 0) {
        result.push({
          level,
          files: levelDeps,
          path: paths[0] || [],
        });
      }
    }
    
    return result;
  }

  private traverseDependencies(
    current: string,
    remainingDepth: number,
    visited: Set<string>,
    currentPath: string[],
    levelDeps: string[],
    paths: string[][]
  ): void {
    if (remainingDepth === 0) {
      return;
    }

    const deps = this.dependencyMap.get(current);
    if (!deps) {
      return;
    }

    for (const dep of deps) {
      if (!visited.has(dep)) {
        visited.add(dep);
        const newPath = [...currentPath, dep];
        
        if (remainingDepth === 1) {
          levelDeps.push(dep);
          paths.push(newPath);
        } else {
          this.traverseDependencies(dep, remainingDepth - 1, visited, newPath, levelDeps, paths);
        }
      }
    }
  }

  private getReverseTransitiveDependencies(filePath: string, maxDepth: number): TransitiveDependency[] {
    const result: TransitiveDependency[] = [];
    const visited = new Set<string>([filePath]);
    
    for (let level = 1; level <= maxDepth; level++) {
      const levelDeps: string[] = [];
      const paths: string[][] = [];
      
      this.traverseReverseDependencies(filePath, level, visited, [], levelDeps, paths);
      
      if (levelDeps.length > 0) {
        result.push({
          level,
          files: levelDeps,
          path: paths[0] || [],
        });
      }
    }
    
    return result;
  }

  private traverseReverseDependencies(
    current: string,
    remainingDepth: number,
    visited: Set<string>,
    currentPath: string[],
    levelDeps: string[],
    paths: string[][]
  ): void {
    if (remainingDepth === 0) {
      return;
    }

    const deps = this.reverseDependencyMap.get(current);
    if (!deps) {
      return;
    }

    for (const dep of deps) {
      if (!visited.has(dep)) {
        visited.add(dep);
        const newPath = [...currentPath, dep];
        
        if (remainingDepth === 1) {
          levelDeps.push(dep);
          paths.push(newPath);
        } else {
          this.traverseReverseDependencies(dep, remainingDepth - 1, visited, newPath, levelDeps, paths);
        }
      }
    }
  }

  private detectCircularDependencies(filePath: string): CircularDependency[] {
    const cycles: CircularDependency[] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const currentPath: string[] = [];

    this.detectCyclesHelper(filePath, visited, recursionStack, currentPath, cycles);

    return cycles;
  }

  private detectCyclesHelper(
    current: string,
    visited: Set<string>,
    recursionStack: Set<string>,
    currentPath: string[],
    cycles: CircularDependency[]
  ): void {
    visited.add(current);
    recursionStack.add(current);
    currentPath.push(current);

    const deps = this.dependencyMap.get(current);
    if (deps) {
      for (const dep of deps) {
        if (!visited.has(dep)) {
          this.detectCyclesHelper(dep, visited, recursionStack, currentPath, cycles);
        } else if (recursionStack.has(dep)) {
          const cycleStart = currentPath.indexOf(dep);
          const cycle = [...currentPath.slice(cycleStart), dep];
          cycles.push({
            cycle,
            severity: cycle.length > 5 ? "error" : "warning",
          });
        }
      }
    }

    recursionStack.delete(current);
    currentPath.pop();
  }

  private calculateImpactScore(filePath: string): number {
    const importedBy = this.reverseDependencyMap.get(filePath);
    const directImpact = importedBy ? importedBy.size : 0;
    
    const transitiveImportedBy = this.getReverseTransitiveDependencies(filePath, 2);
    const transitiveImpact = transitiveImportedBy.reduce((sum, level) => sum + level.files.length, 0);
    
    return directImpact * 10 + transitiveImpact * 5;
  }

  private calculateCentralityScore(filePath: string): number {
    const directImports = this.dependencyMap.get(filePath)?.size || 0;
    const importedBy = this.reverseDependencyMap.get(filePath)?.size || 0;
    
    return (directImports + importedBy) / 2;
  }
}