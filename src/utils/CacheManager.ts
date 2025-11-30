import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { CodebaseIndex } from "../core/WorkspaceIndexer";

export class CacheManager {
  private context: vscode.ExtensionContext;
  private cacheVersion = "1.0.0";

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  public saveIndex(index: CodebaseIndex): void {
    try {
      const cachePath = this.getCachePath();
      const cacheData = {
        version: this.cacheVersion,
        timestamp: Date.now(),
        index: {
          files: Array.from(index.files.entries()),
          totalFunctions: index.totalFunctions,
          totalClasses: index.totalClasses,
          timestamp: index.timestamp,
          version: index.version,
        },
      };

      fs.writeFileSync(cachePath, JSON.stringify(cacheData), "utf8");
    } catch (error) {
      console.error("Failed to save cache:", error);
    }
  }

  public loadIndex(): CodebaseIndex | null {
    try {
      const cachePath = this.getCachePath();
      
      if (!fs.existsSync(cachePath)) {
        return null;
      }

      const cacheData = JSON.parse(fs.readFileSync(cachePath, "utf8"));

      if (cacheData.version !== this.cacheVersion) {
        this.clearCache();
        return null;
      }

      const ageMs = Date.now() - cacheData.timestamp;
      const maxAgeMs = 24 * 60 * 60 * 1000;
      
      if (ageMs > maxAgeMs) {
        this.clearCache();
        return null;
      }

      return {
        files: new Map(cacheData.index.files),
        totalFunctions: cacheData.index.totalFunctions,
        totalClasses: cacheData.index.totalClasses,
        timestamp: cacheData.index.timestamp,
        version: cacheData.index.version,
      };
    } catch (error) {
      console.error("Failed to load cache:", error);
      return null;
    }
  }

  public clearCache(): void {
    try {
      const cachePath = this.getCachePath();
      if (fs.existsSync(cachePath)) {
        fs.unlinkSync(cachePath);
      }
    } catch (error) {
      console.error("Failed to clear cache:", error);
    }
  }

  private getCachePath(): string {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return path.join(this.context.globalStorageUri.fsPath, "codebase-index.json");
    }

    const storagePath = this.context.storageUri?.fsPath || this.context.globalStorageUri.fsPath;
    
    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true });
    }

    return path.join(storagePath, "codebase-index.json");
  }
}