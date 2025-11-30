import * as vscode from "vscode";
import { CodebaseIndex } from "../core/WorkspaceIndexer";

export type IndexStatus = "ready" | "indexing" | "outdated" | "error" | "none";

export class StatusBarManager {
  private statusBarItem: vscode.StatusBarItem;
  private currentStatus: IndexStatus = "none";
  private filesIndexed: number = 0;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = "aiDevAssistant.showIndexStatus";
    this.statusBarItem.show();
    this.updateDisplay();
  }

  public setStatus(status: IndexStatus, filesCount?: number): void {
    this.currentStatus = status;
    if (filesCount !== undefined) {
      this.filesIndexed = filesCount;
    }
    this.updateDisplay();
  }

  public setProgress(current: number, total: number): void {
    this.currentStatus = "indexing";
    this.statusBarItem.text = `🤖 Indexing... ${current}/${total} files`;
  }

  private updateDisplay(): void {
    switch (this.currentStatus) {
      case "ready":
        this.statusBarItem.text = `🤖 Ready (${this.filesIndexed} files indexed)`;
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.tooltip = "AI Dev Assistant - Index up to date";
        break;

      case "indexing":
        this.statusBarItem.text = `🤖 Indexing...`;
        this.statusBarItem.backgroundColor = new vscode.ThemeColor(
          "statusBarItem.warningBackground"
        );
        this.statusBarItem.tooltip = "AI Dev Assistant - Indexing workspace";
        break;

      case "outdated":
        this.statusBarItem.text = `⚠️ Index outdated`;
        this.statusBarItem.backgroundColor = new vscode.ThemeColor(
          "statusBarItem.warningBackground"
        );
        this.statusBarItem.tooltip = "AI Dev Assistant - Index needs refresh";
        break;

      case "error":
        this.statusBarItem.text = `❌ Indexing failed`;
        this.statusBarItem.backgroundColor = new vscode.ThemeColor(
          "statusBarItem.errorBackground"
        );
        this.statusBarItem.tooltip = "AI Dev Assistant - Indexing error";
        break;

      case "none":
        this.statusBarItem.text = `🤖 AI Assistant`;
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.tooltip = "AI Dev Assistant - Click to index workspace";
        break;
    }
  }

  public dispose(): void {
    this.statusBarItem.dispose();
  }
}