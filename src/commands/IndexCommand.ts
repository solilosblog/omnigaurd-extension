import * as vscode from "vscode";
import { WorkspaceIndexer } from "../core/WorkspaceIndexer";
import { StatusBarManager } from "../ui/StatusBarManager";
import { ProgressReporter } from "../ui/ProgressReporter";

export class IndexCommand {
  constructor(
    private indexer: WorkspaceIndexer,
    private statusBar: StatusBarManager,
    private progressReporter: ProgressReporter
  ) {}

  public async execute(): Promise<void> {
    if (!vscode.workspace.workspaceFolders) {
      vscode.window.showErrorMessage("Open a folder or workspace first.");
      return;
    }

    this.statusBar.setStatus("indexing");

    try {
      let currentFile = 0;

      this.indexer.setProgressCallback((progress) => {
        currentFile = progress.current;
        this.statusBar.setProgress(progress.current, progress.total);
      });

      const index = await this.indexer.indexWorkspace(true);

      this.statusBar.setStatus("ready", index.files.size);
      
      this.progressReporter.showCompletionMessage(index.files.size, 0, 0);
    } catch (error: any) {
      this.statusBar.setStatus("error");
      vscode.window.showErrorMessage(`Indexing failed: ${error.message}`);
    }
  }
}