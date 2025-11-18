import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { askLLM } from "./aiService";
import { extractCurrentFunctionMetadata } from "./codeAnalysis/metadataExtractor";
import { ASTParser } from "./codeAnalysis/astParser";

export class ChatViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private readonly _extensionUri: vscode.Uri;
  private readonly _isTrusted: boolean;
  private astParser: ASTParser;

  constructor(extensionUri: vscode.Uri, isTrusted: boolean) {
    this._extensionUri = extensionUri;
    this._isTrusted = isTrusted;
    this.astParser = new ASTParser();
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

      // 🔥 Get FOCUSED code context using Tree-sitter
      const codeContext = await this._getEnhancedCodeContext();

      let fullPrompt = userMessage;
      if (codeContext) {
        fullPrompt = this._buildContextualPrompt(userMessage, codeContext);
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

  /**
   * 🔥 NEW: Get focused code context using Tree-sitter AST parsing
   */
  private async _getEnhancedCodeContext(): Promise<any> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return null;
    }

    const document = editor.document;
    const code = document.getText();
    const language = document.languageId;
    const fileName = path.basename(document.fileName);

    // Parse file with Tree-sitter
    const analysis = this.astParser.parseFile(code, language);
    if (!analysis) {
      // Fallback to basic context if Tree-sitter fails
      return {
        fileName,
        language,
        fullCode: code,
        type: "basic",
      };
    }

    // Get current cursor position
    const position = editor.selection.active;
    const currentLine = position.line + 1;

    // Find the function where cursor is located
    const currentFunction = analysis.functions.find(
      (f) => currentLine >= f.lineStart && currentLine <= f.lineEnd
    );

    return {
      fileName,
      language,
      type: "enhanced",
      // File-level metadata
      totalFunctions: analysis.functions.length,
      totalClasses: analysis.classes.length,
      imports: analysis.imports,
      // Current function context (if cursor is in a function)
      currentFunction: currentFunction
        ? {
            name: currentFunction.name,
            signature: currentFunction.signature,
            params: currentFunction.params,
            returnType: currentFunction.returnType,
            complexity: currentFunction.complexity,
            lineStart: currentFunction.lineStart,
            lineEnd: currentFunction.lineEnd,
            code: this._extractFunctionCode(code, currentFunction.lineStart, currentFunction.lineEnd),
          }
        : null,
      // Related functions (for test generation)
      relatedFunctions: analysis.functions
        .filter((f) => f.name !== currentFunction?.name)
        .slice(0, 3) // Top 3 related functions
        .map((f) => ({
          name: f.name,
          signature: f.signature,
          complexity: f.complexity,
        })),
      // Classes in file
      classes: analysis.classes,
    };
  }

  /**
   * Extract specific function code from file
   */
  private _extractFunctionCode(fullCode: string, lineStart: number, lineEnd: number): string {
    const lines = fullCode.split("\n");
    return lines.slice(lineStart - 1, lineEnd).join("\n");
  }

  /**
   * 🔥 NEW: Build a smart, contextual prompt
   */
  private _buildContextualPrompt(userMessage: string, context: any): string {
    if (context.type === "basic") {
      // Fallback to old behavior
      return `User's current code context:\n\nFile: ${context.fileName}\n\`\`\`${context.language}\n${context.fullCode}\n\`\`\`\n\nUser message: ${userMessage}`;
    }

    // Enhanced context with Tree-sitter metadata
    let prompt = `File: ${context.fileName} (${context.language})\n`;
    prompt += `Total Functions: ${context.totalFunctions}, Total Classes: ${context.totalClasses}\n\n`;

    // Add imports
    if (context.imports.length > 0) {
      prompt += `Imports:\n${context.imports.slice(0, 5).join("\n")}\n\n`;
    }

    // Add classes
    if (context.classes.length > 0) {
      prompt += `Classes: ${context.classes.join(", ")}\n\n`;
    }

    // 🔥 Key: Add current function context (if available)
    if (context.currentFunction) {
      prompt += `Current Function (cursor location):\n`;
      prompt += `- Name: ${context.currentFunction.name}\n`;
      prompt += `- Signature: ${context.currentFunction.signature}\n`;
      prompt += `- Complexity: ${context.currentFunction.complexity}\n`;
      prompt += `- Lines: ${context.currentFunction.lineStart}-${context.currentFunction.lineEnd}\n\n`;
      prompt += `Function Code:\n\`\`\`${context.language}\n${context.currentFunction.code}\n\`\`\`\n\n`;
    }

    // Add related functions (for context)
    if (context.relatedFunctions.length > 0) {
      prompt += `Other Functions in File:\n`;
      context.relatedFunctions.forEach((f: any) => {
        prompt += `- ${f.signature} (complexity: ${f.complexity})\n`;
      });
      prompt += `\n`;
    }

    prompt += `User Request: ${userMessage}`;

    return prompt;
  }

  /**
   * OLD: Basic code context (kept as fallback)
   */
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