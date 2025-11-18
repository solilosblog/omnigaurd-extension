import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { askLLM } from "./aiService";

export class ChatViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private readonly _extensionUri: vscode.Uri;
  private readonly _isTrusted: boolean;

  constructor(extensionUri: vscode.Uri, isTrusted: boolean) {
    this._extensionUri = extensionUri;
    this._isTrusted = isTrusted;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, "media")],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      await this._handleWebviewMessage(message);
    });
  }

  private async _handleWebviewMessage(message: any): Promise<void> {
    switch (message.type) {
      case "sendMessage":
        await this._handleChatMessage(message.text);
        break;

      case "applyEdit":
        await this._handleApplyEdit(message.fileName, message.content);
        break;

      case "runCommand":
        await this._handleRunCommand(message.command);
        break;

      case "showDiff":
        await this._handleShowDiff(
          message.original,
          message.suggested,
          message.fileName
        );
        break;

      default:
        console.warn("Unknown message type:", message.type);
    }
  }

  private async _handleChatMessage(userMessage: string): Promise<void> {
    try {
      this._sendMessageToWebview({
        type: "assistantThinking",
        thinking: true,
      });

      const codeContext = await this._getCodeContext();

      let fullPrompt = userMessage;
      if (codeContext) {
        fullPrompt = `User's current code context:\n\nFile: ${
          codeContext.fileName
        }\n\`\`\`${codeContext.language}\n${
          codeContext.content
        }\n\`\`\`\n\nUser message: ${userMessage}`;
      }

      const response = await askLLM(fullPrompt);

      this._sendMessageToWebview({
        type: "assistantThinking",
        thinking: false,
      });

      this._sendMessageToWebview({
        type: "assistantMessage",
        text: response,
      });
    } catch (error: any) {
      this._sendMessageToWebview({
        type: "assistantThinking",
        thinking: false,
      });

      this._sendMessageToWebview({
        type: "assistantMessage",
        text: `❌ Error: ${error.message || "Failed to get response from AI"}`,
      });

      vscode.window.showErrorMessage(`AI Dev Assistant: ${error.message}`);
    }
  }

  private async _getCodeContext(): Promise<{
    fileName: string;
    language: string;
    content: string;
  } | null> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return null;
    }

    const document = editor.document;
    return {
      fileName: path.basename(document.fileName),
      language: document.languageId,
      content: document.getText(),
    };
  }

  private async _handleApplyEdit(
    fileName: string,
    content: string
  ): Promise<void> {
    try {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor to apply edit");
        return;
      }

      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(
        editor.document.positionAt(0),
        editor.document.positionAt(editor.document.getText().length)
      );

      edit.replace(editor.document.uri, fullRange, content);

      const success = await vscode.workspace.applyEdit(edit);

      if (success) {
        vscode.window.showInformationMessage("AI edit applied successfully!");
      } else {
        vscode.window.showErrorMessage("Failed to apply edit");
      }
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to apply edit: ${error.message}`);
    }
  }

  private async _handleShowDiff(
    original: string,
    suggested: string,
    fileName: string
  ): Promise<void> {
    await vscode.commands.executeCommand(
      "aiDevAssistant.showDiff",
      original,
      suggested,
      fileName
    );
  }

  private async _handleRunCommand(command: string): Promise<void> {
    await vscode.commands.executeCommand("aiDevAssistant.runCommand", command);
  }

  private _sendMessageToWebview(message: any): void {
    this._view?.webview.postMessage(message);
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const htmlPath = vscode.Uri.joinPath(
      this._extensionUri,
      "media",
      "chat.html"
    );

    try {
      return fs.readFileSync(htmlPath.fsPath, "utf8");
    } catch {
      return this._getInlineHtml();
    }
  }

  private _getInlineHtml(): string {
    return `<!DOCTYPE html>
    ...YOUR INLINE HTML...
    </html>`;
  }
}
