import { FileAnalysis } from "../codeAnalysis/astParser";
import { CodebaseIndex } from "./WorkspaceIndexer";
import * as path from "path";

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
  private filePathMap: Map<string, string>;

  constructor(index: CodebaseIndex) {
    this.index = index;
    this.dependencyMap = new Map();
    this.reverseDependencyMap = new Map();
    this.filePathMap = new Map();
    this.buildFilePathMap();
    this.buildDependencyMaps();
  }

  private buildFilePathMap(): void {
    console.log("🗺️ Building file path map for import resolution...");
    
    for (const [filePath, analysis] of this.index.files) {
      const fileName = path.basename(filePath, path.extname(filePath));
      const packagePath = this.extractPackagePath(filePath, analysis);
      
      this.filePathMap.set(fileName, filePath);
      if (packagePath) {
        this.filePathMap.set(packagePath, filePath);
      }
    }
    
    console.log(`✅ File path map built with ${this.filePathMap.size} entries`);
  }

  private extractPackagePath(filePath: string, analysis: FileAnalysis): string | null {
    if (analysis.language === "java") {
      for (const imp of analysis.imports) {
        const match = imp.match(/package\s+([\w.]+);/);
        if (match) {
          const packageName = match[1];
          const className = path.basename(filePath, ".java");
          return `${packageName}.${className}`;
        }
      }
    }
    return null;
  }

  private buildDependencyMaps(): void {
    console.log("🔗 Building dependency maps...");
    
    let totalDependencies = 0;
    
    for (const [filePath, analysis] of this.index.files) {
      const deps = new Set<string>();
      
      console.log(`📄 Processing dependencies for: ${path.basename(filePath)}`);
      console.log(`   Imports found: ${analysis.imports.length}`);
      
      for (const imp of analysis.imports) {
        const resolvedPath = this.resolveImport(imp, filePath, analysis);
        if (resolvedPath && resolvedPath !== filePath) {
          deps.add(resolvedPath);
          totalDependencies++;
          
          console.log(`   ✓ Resolved: ${imp} -> ${path.basename(resolvedPath)}`);
          
          if (!this.reverseDependencyMap.has(resolvedPath)) {
            this.reverseDependencyMap.set(resolvedPath, new Set());
          }
          this.reverseDependencyMap.get(resolvedPath)!.add(filePath);
        } else {
          console.log(`   ✗ Could not resolve: ${imp}`);
        }
      }
      
      this.dependencyMap.set(filePath, deps);
    }
    
    console.log(`✅ Dependency maps built: ${totalDependencies} total dependencies`);
    console.log(`📊 Files with dependencies: ${Array.from(this.dependencyMap.values()).filter(s => s.size > 0).length}/${this.dependencyMap.size}`);
  }

  private resolveImport(importStatement: string, currentFile: string, analysis: FileAnalysis): string | null {
    if (analysis.language === "java") {
      return this.resolveJavaImport(importStatement);
    } else if (analysis.language === "typescript" || analysis.language === "javascript") {
      return this.resolveTypeScriptImport(importStatement, currentFile);
    } else if (analysis.language === "python") {
      return this.resolvePythonImport(importStatement);
    }
    
    return null;
  }

  private resolveJavaImport(importStatement: string): string | null {
    const importMatch = importStatement.match(/import\s+([\w.]+);/);
    if (!importMatch) {
      return null;
    }

    const fullImport = importMatch[1];
    const parts = fullImport.split('.');
    const className = parts[parts.length - 1];
    
    console.log(`   🔍 Java import: ${fullImport} -> Looking for class: ${className}`);
    
    for (const [filePath, analysis] of this.index.files) {
      if (analysis.language !== "java") continue;
      
      const fileClassName = path.basename(filePath, ".java");
      
      if (fileClassName === className) {
        const filePackage = this.getJavaPackage(analysis);
        if (filePackage && fullImport === `${filePackage}.${className}`) {
          console.log(`   ✓✓ Exact match: ${filePath}`);
          return filePath;
        }
        
        if (!filePackage && parts.length === 1) {
          console.log(`   ✓ Name match (no package): ${filePath}`);
          return filePath;
        }
      }
    }
    
    const possiblePath = this.filePathMap.get(className);
    if (possiblePath) {
      console.log(`   ✓ Found via filePathMap: ${possiblePath}`);
      return possiblePath;
    }
    
    const fullPath = this.filePathMap.get(fullImport);
    if (fullPath) {
      console.log(`   ✓ Found via full import path: ${fullPath}`);
      return fullPath;
    }
    
    return null;
  }

  private getJavaPackage(analysis: FileAnalysis): string | null {
    for (const imp of analysis.imports) {
      const match = imp.match(/package\s+([\w.]+);/);
      if (match) {
        return match[1];
      }
    }
    return null;
  }

  private resolveTypeScriptImport(importStatement: string, currentFile: string): string | null {
    const importMatch = importStatement.match(/from\s+['"](.+?)['"]/);
    if (!importMatch) {
      return null;
    }

    const importPath = importMatch[1];
    
    if (importPath.startsWith('.')) {
      const currentDir = path.dirname(currentFile);
      const resolvedPath = path.resolve(currentDir, importPath);
      
      for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
        const fullPath = resolvedPath + ext;
        if (this.index.files.has(fullPath)) {
          return fullPath;
        }
      }
      
      const indexPath = path.join(resolvedPath, 'index.ts');
      if (this.index.files.has(indexPath)) {
        return indexPath;
      }
    }
    
    const fileName = path.basename(importPath);
    for (const [filePath] of this.index.files) {
      if (path.basename(filePath, path.extname(filePath)) === fileName) {
        return filePath;
      }
    }
    
    return null;
  }

  private resolvePythonImport(importStatement: string): string | null {
    const fromMatch = importStatement.match(/from\s+([\w.]+)\s+import/);
    const importMatch = importStatement.match(/import\s+([\w.]+)/);
    
    const moduleName = fromMatch ? fromMatch[1] : importMatch ? importMatch[1] : null;
    if (!moduleName) {
      return null;
    }

    const parts = moduleName.split('.');
    const fileName = parts[parts.length - 1];
    
    for (const [filePath] of this.index.files) {
      if (path.basename(filePath, '.py') === fileName) {
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