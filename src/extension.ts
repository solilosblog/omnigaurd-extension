import * as vscode from "vscode";
import { ChatViewProvider } from "./ChatViewProvider";
import { CodebaseIndexer } from "./codeAnalysis/codebaseIndexer";

export function activate(context: vscode.ExtensionContext) {
  console.log("AI Dev Assistant activated");

  // Initialize Chat Webview Provider
  const chatProvider = new ChatViewProvider(context.extensionUri, true);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "aiDevAssistant.chat",
      chatProvider,
      {
        webviewOptions: { retainContextWhenHidden: true },
      }
    )
  );

  // Register Command: Index Codebase
  const indexCommand = vscode.commands.registerCommand(
    "aiDevAssistant.indexCodebase",
    async () => {
      const indexer = new CodebaseIndexer();

      // Ensure workspace exists
      if (!vscode.workspace.workspaceFolders) {
        vscode.window.showErrorMessage("Open a folder or workspace first.");
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Indexing codebase...",
          cancellable: false,
        },
        async () => {
          try {
            const index = await indexer.indexWorkspace();
            vscode.window.showInformationMessage(
              `Indexed ${index.totalFunctions} functions across ${index.files.size} files.`
            );
          } catch (err) {
            vscode.window.showErrorMessage("Failed to index workspace.");
            console.error(err);
          }
        }
      );
    }
  );

  context.subscriptions.push(indexCommand);
}

export function deactivate() {
  console.log("AI Dev Assistant deactivated");
}
