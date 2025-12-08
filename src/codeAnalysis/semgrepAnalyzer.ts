import { exec } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as fs from "fs";
import * as vscode from "vscode";

const execAsync = promisify(exec);

export interface SemgrepFinding {
  check_id: string;
  path: string;
  start: {
    line: number;
    col: number;
  };
  end: {
    line: number;
    col: number;
  };
  extra: {
    message: string;
    severity: "ERROR" | "WARNING" | "INFO";
    metadata: {
      category?: string;
      confidence?: string;
      cwe?: string[];
      owasp?: string[];
      technology?: string[];
    };
    lines: string;
  };
}

export interface SemgrepResult {
  results: SemgrepFinding[];
  errors: any[];
  paths: {
    scanned: string[];
  };
}

export interface SemgrepAnalysisResult {
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  findings: SemgrepFinding[];
  summary: string;
  categories: Map<string, number>;
}

export class SemgrepAnalyzer {
  private semgrepPath: string = "semgrep";
  private configPath: string;
  private workspaceRoot: string;

  constructor(workspaceRoot: string, configPath?: string) {
    this.workspaceRoot = workspaceRoot;
    this.configPath = configPath || path.join(workspaceRoot, ".semgrep.yml");
  }

  /**
   * Check if Semgrep is installed and available
   */
  public async isSemgrepAvailable(): Promise<boolean> {
    try {
      const { stdout } = await execAsync(`${this.semgrepPath} --version`);
      console.log("✅ Semgrep version:", stdout.trim());
      return true;
    } catch (error) {
      console.warn("⚠️ Semgrep not found in PATH. Please install: pip install semgrep");
      return false;
    }
  }

  /**
   * Analyze a single file with Semgrep
   */
  public async analyzeFile(filePath: string): Promise<SemgrepAnalysisResult | null> {
    const isAvailable = await this.isSemgrepAvailable();
    if (!isAvailable) {
      return null;
    }

    const config = vscode.workspace.getConfiguration("aiDevAssistant.semgrep");
    const enabled = config.get<boolean>("enabled", true);

    if (!enabled) {
      console.log("ℹ️ Semgrep analysis is disabled in settings");
      return null;
    }

    return this.runSemgrep([filePath]);
  }

  /**
   * Analyze multiple files with Semgrep
   */
  public async analyzeFiles(filePaths: string[]): Promise<SemgrepAnalysisResult | null> {
    const isAvailable = await this.isSemgrepAvailable();
    if (!isAvailable) {
      return null;
    }

    const config = vscode.workspace.getConfiguration("aiDevAssistant.semgrep");
    const enabled = config.get<boolean>("enabled", true);

    if (!enabled) {
      return null;
    }

    return this.runSemgrep(filePaths);
  }

  /**
   * Analyze entire workspace with Semgrep
   */
  public async analyzeWorkspace(): Promise<SemgrepAnalysisResult | null> {
    const isAvailable = await this.isSemgrepAvailable();
    if (!isAvailable) {
      return null;
    }

    return this.runSemgrep([this.workspaceRoot]);
  }

  /**
   * Run Semgrep with specified targets
   */
  private async runSemgrep(targets: string[]): Promise<SemgrepAnalysisResult | null> {
    try {
      const config = vscode.workspace.getConfiguration("aiDevAssistant.semgrep");
      const rulesets = config.get<string[]>("rulesets", ["auto"]);
      const timeout = config.get<number>("timeout", 30);
      const maxFileSize = config.get<number>("maxFileSize", 1000000); // 1MB default

      // Build Semgrep command
      let configArg = "";

      // Check if custom config exists
      if (fs.existsSync(this.configPath)) {
        configArg = `--config ${this.configPath}`;
      } else {
        // Use specified rulesets
        configArg = rulesets.map(r => `--config ${r}`).join(" ");
      }

      const targetsArg = targets.map(t => `"${t}"`).join(" ");

      const command = `${this.semgrepPath} ${configArg} --json --max-target-bytes ${maxFileSize} --timeout ${timeout} ${targetsArg}`;

      console.log("🔍 Running Semgrep:", command);

      const { stdout, stderr } = await execAsync(command, {
        cwd: this.workspaceRoot,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });

      if (stderr) {
        console.warn("⚠️ Semgrep stderr:", stderr);
      }

      const result: SemgrepResult = JSON.parse(stdout);

      return this.processResults(result);
    } catch (error: any) {
      // Semgrep returns non-zero exit code when findings are found
      // Check if stdout contains valid JSON
      if (error.stdout) {
        try {
          const result: SemgrepResult = JSON.parse(error.stdout);
          return this.processResults(result);
        } catch (parseError) {
          console.error("❌ Failed to parse Semgrep output:", parseError);
        }
      }

      console.error("❌ Semgrep analysis failed:", error.message);
      return null;
    }
  }

  /**
   * Process Semgrep results and generate analysis
   */
  private processResults(result: SemgrepResult): SemgrepAnalysisResult {
    const findings = result.results || [];

    let criticalCount = 0;
    let highCount = 0;
    let mediumCount = 0;
    let lowCount = 0;

    const categories = new Map<string, number>();

    findings.forEach((finding) => {
      // Count by severity
      switch (finding.extra.severity) {
        case "ERROR":
          criticalCount++;
          break;
        case "WARNING":
          mediumCount++;
          break;
        case "INFO":
          lowCount++;
          break;
      }

      // Count by category
      const category = finding.extra.metadata.category || "general";
      categories.set(category, (categories.get(category) || 0) + 1);
    });

    // Generate summary
    const summary = this.generateSummary(
      findings.length,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      categories
    );

    return {
      totalFindings: findings.length,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      findings,
      summary,
      categories,
    };
  }

  /**
   * Generate a human-readable summary of findings
   */
  private generateSummary(
    total: number,
    critical: number,
    high: number,
    medium: number,
    low: number,
    categories: Map<string, number>
  ): string {
    if (total === 0) {
      return "✅ No issues found by Semgrep analysis.";
    }

    let summary = `🔍 Semgrep found ${total} issue(s):\n`;

    if (critical > 0) {
      summary += `  - ${critical} CRITICAL\n`;
    }
    if (high > 0) {
      summary += `  - ${high} HIGH\n`;
    }
    if (medium > 0) {
      summary += `  - ${medium} MEDIUM\n`;
    }
    if (low > 0) {
      summary += `  - ${low} LOW\n`;
    }

    if (categories.size > 0) {
      summary += "\nCategories:\n";
      Array.from(categories.entries())
        .sort((a, b) => b[1] - a[1])
        .forEach(([category, count]) => {
          summary += `  - ${category}: ${count}\n`;
        });
    }

    return summary;
  }

  /**
   * Format findings for AI context
   */
  public formatFindingsForAI(analysis: SemgrepAnalysisResult): string {
    if (!analysis || analysis.totalFindings === 0) {
      return "";
    }

    let output = `\n## 🔒 Security & Code Quality Analysis (Semgrep)\n\n`;
    output += analysis.summary + "\n\n";

    // Group findings by severity
    const criticalFindings = analysis.findings.filter(f => f.extra.severity === "ERROR");
    const warningFindings = analysis.findings.filter(f => f.extra.severity === "WARNING");
    const infoFindings = analysis.findings.filter(f => f.extra.severity === "INFO");

    if (criticalFindings.length > 0) {
      output += "### ❌ Critical Issues:\n";
      criticalFindings.forEach((finding, idx) => {
        output += this.formatFinding(finding, idx + 1);
      });
    }

    if (warningFindings.length > 0) {
      output += "\n### ⚠️ Warnings:\n";
      warningFindings.forEach((finding, idx) => {
        output += this.formatFinding(finding, idx + 1);
      });
    }

    if (infoFindings.length > 0 && infoFindings.length <= 5) {
      output += "\n### ℹ️ Informational:\n";
      infoFindings.forEach((finding, idx) => {
        output += this.formatFinding(finding, idx + 1);
      });
    }

    return output;
  }

  /**
   * Format a single finding
   */
  private formatFinding(finding: SemgrepFinding, index: number): string {
    let output = `${index}. **${finding.check_id}**\n`;
    output += `   - Location: ${finding.path}:${finding.start.line}\n`;
    output += `   - Message: ${finding.extra.message}\n`;

    if (finding.extra.metadata.cwe && finding.extra.metadata.cwe.length > 0) {
      output += `   - CWE: ${finding.extra.metadata.cwe.join(", ")}\n`;
    }

    if (finding.extra.metadata.owasp && finding.extra.metadata.owasp.length > 0) {
      output += `   - OWASP: ${finding.extra.metadata.owasp.join(", ")}\n`;
    }

    if (finding.extra.lines) {
      output += `   - Code: \`${finding.extra.lines.trim()}\`\n`;
    }

    output += "\n";
    return output;
  }

  /**
   * Get top N most critical findings
   */
  public getTopFindings(analysis: SemgrepAnalysisResult, limit: number = 10): SemgrepFinding[] {
    if (!analysis) {
      return [];
    }

    // Sort by severity (ERROR > WARNING > INFO) and take top N
    const severityOrder = { ERROR: 0, WARNING: 1, INFO: 2 };

    return analysis.findings
      .sort((a, b) => {
        const severityDiff = severityOrder[a.extra.severity] - severityOrder[b.extra.severity];
        if (severityDiff !== 0) {
          return severityDiff;
        }
        // If same severity, sort by path
        return a.path.localeCompare(b.path);
      })
      .slice(0, limit);
  }
}
