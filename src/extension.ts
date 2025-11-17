import * as vscode from "vscode";
import { ChatViewProvider } from "./ChatViewProvider";
import * as dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

/**
 * Extension activation function - called when extension is activated
 * Activation happens when the view is first opened (onView:aiDevAssistant.chat)
 */
export function activate(context: vscode.ExtensionContext) {
  console.log("AI Dev Assistant extension is now active");

  try {
    // Check workspace trust - disable dangerous features in untrusted workspaces
    const isTrusted = vscode.workspace.isTrusted;
    if (!isTrusted) {
      vscode.window.showWarningMessage(
        "AI Dev Assistant: Some features disabled in untrusted workspace"
      );
    }

    // Create and register the Chat Webview Provider
    const chatProvider = new ChatViewProvider(context.extensionUri, isTrusted);

    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        "aiDevAssistant.chat",
        chatProvider,
        {
          webviewOptions: {
            retainContextWhenHidden: true, // Keep webview state when hidden
          },
        }
      )
    );

    // Register command to open the chat panel
    const openChatCommand = vscode.commands.registerCommand(
      "aiDevAssistant.openChat",
      () => {
        // Focus on the AI Dev Assistant view
        vscode.commands.executeCommand("aiDevAssistant.chat.focus");
        vscode.window.showInformationMessage("AI Dev Assistant chat opened!");
      }
    );

    // Register command to show diff view (called from webview)
    const showDiffCommand = vscode.commands.registerCommand(
      "aiDevAssistant.showDiff",
      async (
        originalContent: string,
        suggestedContent: string,
        fileName: string
      ) => {
        try {
          // Create temporary documents for diff comparison
          const originalUri = vscode.Uri.parse(
            `untitled:${fileName} (Original)`
          );
          const suggestedUri = vscode.Uri.parse(
            `untitled:${fileName} (AI Suggestion)`
          );

          // Open both documents
          const originalDoc = await vscode.workspace.openTextDocument(
            originalUri
          );
          const suggestedDoc = await vscode.workspace.openTextDocument(
            suggestedUri
          );

          // Apply content to documents
          const originalEdit = new vscode.WorkspaceEdit();
          originalEdit.insert(
            originalUri,
            new vscode.Position(0, 0),
            originalContent
          );
          await vscode.workspace.applyEdit(originalEdit);

          const suggestedEdit = new vscode.WorkspaceEdit();
          suggestedEdit.insert(
            suggestedUri,
            new vscode.Position(0, 0),
            suggestedContent
          );
          await vscode.workspace.applyEdit(suggestedEdit);

          // Show diff view
          await vscode.commands.executeCommand(
            "vscode.diff",
            originalDoc.uri,
            suggestedDoc.uri,
            `${fileName}: Original ↔ AI Suggestion`
          );
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to show diff: ${error}`);
        }
      }
    );

    // Register command to run terminal command (with user confirmation)
    const runCommandCommand = vscode.commands.registerCommand(
      "aiDevAssistant.runCommand",
      async (command: string) => {
        // Check workspace trust before executing commands
        if (!isTrusted) {
          vscode.window.showErrorMessage(
            "Cannot run commands in untrusted workspace for security reasons"
          );
          return;
        }

        // Ask for explicit user confirmation
        const confirmation = await vscode.window.showInformationMessage(
          `AI Dev Assistant wants to run: "${command}"\n\nDo you want to execute this command?`,
          { modal: true },
          "Run Command",
          "Cancel"
        );

        if (confirmation === "Run Command") {
          // Create a new terminal and run the command
          const terminal = vscode.window.createTerminal("AI Dev Assistant");
          terminal.show();
          terminal.sendText(command);

          vscode.window.showInformationMessage("Command sent to terminal");
        } else {
          vscode.window.showInformationMessage("Command execution cancelled");
        }
      }
    );

    // Add all commands to subscriptions for cleanup
    context.subscriptions.push(
      openChatCommand,
      showDiffCommand,
      runCommandCommand
    );

    console.log("AI Dev Assistant: All commands registered successfully");
  } catch (error) {
    console.error("AI Dev Assistant activation error:", error);
    vscode.window.showErrorMessage(
      `AI Dev Assistant failed to activate: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
    throw error;
  }
}

/**
 * Extension deactivation function - called when extension is deactivated
 * Clean up resources here if needed
 */
export function deactivate() {
  console.log("AI Dev Assistant extension deactivated");
}
