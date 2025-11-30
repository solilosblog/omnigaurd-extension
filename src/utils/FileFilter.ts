import * as vscode from "vscode";
import * as path from "path";

export interface FilterConfig {
  includeTiers: string[];
  customInclude: string[];
  customExclude: string[];
  maxFilesPerBatch: number;
  respectGitignore: boolean;
}

export class FileFilter {
  private config: FilterConfig;

  constructor(config?: Partial<FilterConfig>) {
    this.config = {
      includeTiers: ["production", "tests", "config"],
      customInclude: [],
      customExclude: [],
      maxFilesPerBatch: 50,
      respectGitignore: true,
      ...config,
    };
  }

  public async getFilteredFiles(): Promise<vscode.Uri[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return [];
    }

    const allFiles: vscode.Uri[] = [];

    if (this.config.includeTiers.includes("production")) {
      const prodFiles = await vscode.workspace.findFiles(
        "**/*.{java,ts,js,py,jsx,tsx}",
        this.buildExcludePattern()
      );
      allFiles.push(...prodFiles);
    }

    if (this.config.includeTiers.includes("tests")) {
      const testFiles = await vscode.workspace.findFiles(
        "**/*.{test,spec}.{java,ts,js,py}",
        this.buildExcludePattern()
      );
      allFiles.push(...testFiles);
    }

    if (this.config.includeTiers.includes("config")) {
      const configFiles = await vscode.workspace.findFiles(
        "**/{package.json,pom.xml,tsconfig.json,build.gradle}",
        this.buildExcludePattern()
      );
      allFiles.push(...configFiles);
    }

    for (const pattern of this.config.customInclude) {
      const customFiles = await vscode.workspace.findFiles(
        pattern,
        this.buildExcludePattern()
      );
      allFiles.push(...customFiles);
    }

    const uniqueFiles = Array.from(new Set(allFiles.map(f => f.fsPath)))
      .map(fsPath => vscode.Uri.file(fsPath));

    return uniqueFiles;
  }

  private buildExcludePattern(): string {
    const patterns: string[] = [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/target/**",
      "**/.git/**",
      "**/.vscode/**",
      "**/*.min.js",
      "**/*.bundle.js",
      "**/out/**",
      "**/.next/**",
      "**/.cache/**",
    ];

    patterns.push(...this.config.customExclude);

    return `{${patterns.join(",")}}`;
  }

  public classifyFile(filePath: string): "production" | "test" | "config" | "other" {
    const fileName = path.basename(filePath).toLowerCase();

    if (fileName.includes("test") || fileName.includes("spec")) {
      return "test";
    }

    if (
      fileName === "package.json" ||
      fileName === "pom.xml" ||
      fileName === "tsconfig.json" ||
      fileName === "build.gradle"
    ) {
      return "config";
    }

    const ext = path.extname(filePath);
    if ([".java", ".ts", ".js", ".py", ".jsx", ".tsx"].includes(ext)) {
      return "production";
    }

    return "other";
  }
}