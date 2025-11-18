import * as vscode from "vscode";
import * as path from "path";
import { ASTParser, FileAnalysis } from "./astParser";

export interface CodebaseIndex {
  files: Map<string, FileAnalysis>;
  totalFunctions: number;
  totalClasses: number;
}

export class CodebaseIndexer {
  private parser: ASTParser;
  private index: CodebaseIndex;

  constructor() {
    this.parser = new ASTParser();
    this.index = {
      files: new Map(),
      totalFunctions: 0,
      totalClasses: 0,
    };
  }

  public async indexWorkspace(): Promise<CodebaseIndex> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return this.index;

    const files = await vscode.workspace.findFiles(
      "**/*.{java,js,ts,py}",
      "**/node_modules/**"
    );

    for (const file of files) {
      await this.indexFile(file);
    }

    return this.index;
  }

  private async indexFile(fileUri: vscode.Uri): Promise<void> {
    try {
      const document = await vscode.workspace.openTextDocument(fileUri);
      const code = document.getText();
      const language = document.languageId;

      const analysis = this.parser.parseFile(code, language);
      if (!analysis) return;

      analysis.fileName = path.basename(fileUri.fsPath);
      this.index.files.set(fileUri.fsPath, analysis);
      this.index.totalFunctions += analysis.functions.length;
      this.index.totalClasses += analysis.classes.length;
    } catch (error) {
      console.error(`Failed to index ${fileUri.fsPath}:`, error);
    }
  }

  public getIndex(): CodebaseIndex {
    return this.index;
  }

  public findFunction(functionName: string): FileAnalysis | null {
    for (const [, analysis] of this.index.files) {
      const func = analysis.functions.find((f) => f.name === functionName);
      if (func) return analysis;
    }
    return null;
  }
}