import * as vscode from "vscode";
import * as path from "path";
import { ASTParser, FileAnalysis } from "../codeAnalysis/astParser";
import { FileFilter } from "../utils/FileFilter";
import { ErrorHandler } from "../utils/ErrorHandler";
import { CacheManager } from "../utils/CacheManager";

export interface IndexingProgress {
  current: number;
  total: number;
  currentFile: string;
  status: "indexing" | "complete" | "error";
}

export interface CodebaseIndex {
  files: Map<string, FileAnalysis>;
  totalFunctions: number;
  totalClasses: number;
  timestamp: number;
  version: string;
}

export class WorkspaceIndexer {
  private parser: ASTParser;
  private fileFilter: FileFilter;
  private errorHandler: ErrorHandler;
  private cacheManager: CacheManager;
  private progressCallback?: (progress: IndexingProgress) => void;

  constructor(
    parser: ASTParser,
    fileFilter: FileFilter,
    errorHandler: ErrorHandler,
    cacheManager: CacheManager
  ) {
    this.parser = parser;
    this.fileFilter = fileFilter;
    this.errorHandler = errorHandler;
    this.cacheManager = cacheManager;
  }

  public setProgressCallback(callback: (progress: IndexingProgress) => void): void {
    this.progressCallback = callback;
  }

  public async indexWorkspace(forceRefresh: boolean = false): Promise<CodebaseIndex> {
    const cachedIndex = this.cacheManager.loadIndex();
    if (!forceRefresh && cachedIndex) {
      return cachedIndex;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      throw new Error("No workspace folder open");
    }

    const files = await this.fileFilter.getFilteredFiles();
    const index: CodebaseIndex = {
      files: new Map(),
      totalFunctions: 0,
      totalClasses: 0,
      timestamp: Date.now(),
      version: "1.0.0",
    };

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      if (this.progressCallback) {
        this.progressCallback({
          current: i + 1,
          total: files.length,
          currentFile: path.basename(file.fsPath),
          status: "indexing",
        });
      }

      await this.indexFile(file, index);
    }

    if (this.progressCallback) {
      this.progressCallback({
        current: files.length,
        total: files.length,
        currentFile: "",
        status: "complete",
      });
    }

    this.cacheManager.saveIndex(index);
    return index;
  }

  private async indexFile(fileUri: vscode.Uri, index: CodebaseIndex): Promise<void> {
    try {
      const result = await this.errorHandler.executeWithRetry(async () => {
        const document = await vscode.workspace.openTextDocument(fileUri);
        const code = document.getText();
        const language = document.languageId;

        const analysis = this.parser.parseFile(code, language);
        if (!analysis) {
          throw new Error(`Failed to parse ${fileUri.fsPath}`);
        }

        analysis.fileName = path.basename(fileUri.fsPath);
        return analysis;
      });

      if (result.success && result.data) {
        index.files.set(fileUri.fsPath, result.data);
        index.totalFunctions += result.data.functions.length;
        index.totalClasses += result.data.classes.length;
      }
    } catch (error) {
      console.error(`Failed to index ${fileUri.fsPath}:`, error);
    }
  }

  public async updateFile(fileUri: vscode.Uri): Promise<void> {
    const index = this.cacheManager.loadIndex();
    if (!index) {
      return;
    }

    await this.indexFile(fileUri, index);
    this.cacheManager.saveIndex(index);
  }
}