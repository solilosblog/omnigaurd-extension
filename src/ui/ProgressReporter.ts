import * as vscode from "vscode";

export interface ProgressOptions {
  title: string;
  cancellable: boolean;
}

export class ProgressReporter {
  public async withProgress<T>(
    options: ProgressOptions,
    task: (
      progress: vscode.Progress<{ message?: string; increment?: number }>,
      token: vscode.CancellationToken
    ) => Promise<T>
  ): Promise<T> {
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: options.title,
        cancellable: options.cancellable,
      },
      task
    );
  }

  public async showIndexingProgress(
    totalFiles: number,
    onProgress: (current: number) => void
  ): Promise<void> {
    await this.withProgress(
      {
        title: "Indexing codebase",
        cancellable: true,
      },
      async (progress, token) => {
        for (let i = 0; i < totalFiles; i++) {
          if (token.isCancellationRequested) {
            throw new Error("Indexing cancelled");
          }

          const percentage = Math.round(((i + 1) / totalFiles) * 100);
          progress.report({
            message: `${i + 1}/${totalFiles} files (${percentage}%)`,
            increment: (1 / totalFiles) * 100,
          });

          onProgress(i + 1);
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }
    );
  }

  public showCompletionMessage(
    success: number,
    partial: number,
    failed: number
  ): void {
    const message = `✅ Indexed ${success} files`;
    const details: string[] = [];

    if (partial > 0) {
      details.push(`⚠️ ${partial} partially indexed`);
    }

    if (failed > 0) {
      details.push(`❌ ${failed} failed`);
    }

    const fullMessage =
      details.length > 0 ? `${message}\n${details.join("\n")}` : message;

    if (failed > 0) {
      vscode.window.showWarningMessage(fullMessage, "View Details");
    } else {
      vscode.window.showInformationMessage(fullMessage);
    }
  }
}