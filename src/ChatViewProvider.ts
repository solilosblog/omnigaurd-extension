import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { askLLM } from "./aiService";
import { extractCurrentFunctionMetadata } from "./codeAnalysis/metadataExtractor";
import { ASTParser } from "./codeAnalysis/astParser";
import { BatchManager, Batch } from "./core/BatchManager";
import { ContextBuilder, ConversationContext } from "./core/ContextBuilder";
import { CacheManager } from "./utils/CacheManager";
import { DependencyResolver } from "./core/DependencyResolver";
import { DependencyGraphBuilder } from "./graph/DependencyGraphBuilder";

export class ChatViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private readonly _extensionUri: vscode.Uri;
  private readonly _isTrusted: boolean;
  private astParser: ASTParser;
  private batchManager?: BatchManager;
  private contextBuilder?: ContextBuilder;
  private currentBatchId: number = 0;
  private conversationContext: ConversationContext = {
    completedBatches: [],
    insights: [],
    goal: "",
  };
  private cacheManager: CacheManager;

  constructor(extensionUri: vscode.Uri, isTrusted: boolean, cacheManager: CacheManager) {
    this._extensionUri = extensionUri;
    this._isTrusted = isTrusted;
    this.astParser = new ASTParser();
    this.cacheManager = cacheManager;
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

      case "nextBatch":
        await this._handleNextBatch();
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

    const config = vscode.workspace.getConfiguration("aiDevAssistant");
    const contextMode = config.get<string>("contextMode.default") || "smart";

    if (contextMode === "workspace") {
      const index = this.cacheManager.loadIndex();
      
      if (!index || index.files.size === 0) {
        this._sendMessageToWebview({
          type: "assistantThinking",
          thinking: false,
        });

        this._sendMessageToWebview({
          type: "assistantMessage",
          text: "⚠️ Workspace not indexed. Indexing now...\n\nPlease wait..."
        });

        try {
          await vscode.commands.executeCommand("aiDevAssistant.indexCodebase");
          
          this._sendMessageToWebview({
            type: "assistantMessage",
            text: "✅ Workspace indexed successfully! Please ask your question again."
          });
        } catch (error: any) {
          this._sendMessageToWebview({
            type: "assistantMessage",
            text: `❌ Indexing failed: ${error.message}\n\nPlease try:\n1. Check console for errors\n2. Switch to Smart Mode\n3. Try again`
          });
        }
        return;
      }

      try {
        const codebaseContext = await this._getWorkspaceContext();
        
        if (!codebaseContext) {
          throw new Error("Failed to build workspace context");
        }

        console.log("Sending workspace context:", {
          mode: codebaseContext.mode,
          filesCount: codebaseContext.files.length,
          batch: `${codebaseContext.batchNumber}/${codebaseContext.totalBatches}`
        });

        const response = await askLLM(userMessage, codebaseContext);

        this._sendMessageToWebview({
          type: "assistantThinking",
          thinking: false,
        });

        this._sendMessageToWebview({
          type: "assistantMessage",
          text: `📊 **Workspace Context Active** (${index.files.size} files, Batch ${codebaseContext.batchNumber})\n\n${response}`,
        });
        return;
      } catch (error: any) {
        console.error("Workspace context error:", error);
        
        this._sendMessageToWebview({
          type: "assistantThinking",
          thinking: false,
        });

        this._sendMessageToWebview({
          type: "assistantMessage",
          text: `❌ Error using workspace context: ${error.message}\n\nFalling back to single-file mode...`
        });
      }
    }

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
    console.error("Chat error:", error);
    
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

  private async _getWorkspaceContext(): Promise<any> {
    const index = this.cacheManager.loadIndex();

    if (!index) {
      vscode.window.showWarningMessage("Workspace not indexed. Please index first.");
      return null;
    }

    if (!this.batchManager) {
      const dependencyResolver = new DependencyResolver(index);
      this.batchManager = new BatchManager(dependencyResolver);
      const batches = this.batchManager.createBatches(index, {
        maxFilesPerBatch: 50,
        respectLayers: true,
        prioritizeByComplexity: false,
      });

      const graphBuilder = new DependencyGraphBuilder(index, dependencyResolver);
      this.contextBuilder = new ContextBuilder(graphBuilder);

      this.currentBatchId = 1;
    }

    const currentBatch = this.batchManager.getBatch(this.currentBatchId);
    if (!currentBatch) {
      return null;
    }

    const dependencyResolver = new DependencyResolver(index);
    const graphBuilder = new DependencyGraphBuilder(index, dependencyResolver);
    const graph = graphBuilder.buildGraph();

    const context = await this.contextBuilder!.buildContext(
      currentBatch,
      graph,
      this.conversationContext
    );

    return context;
  }

  private async _handleNextBatch(): Promise<void> {
    if (!this.batchManager) {
      return;
    }

    this.conversationContext.completedBatches.push(this.currentBatchId);
    this.currentBatchId++;

    const nextBatch = this.batchManager.getBatch(this.currentBatchId);
    if (nextBatch) {
      this._sendMessageToWebview({
        type: "assistantMessage",
        text: `Moving to ${this.batchManager.getBatchSummary(nextBatch)}`,
      });
    } else {
      this._sendMessageToWebview({
        type: "assistantMessage",
        text: "All batches completed!",
      });
    }
  }

  private async _getEnhancedCodeContext(): Promise<any> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return null;
    }

    const document = editor.document;
    const code = document.getText();
    const language = document.languageId;
    const fileName = path.basename(document.fileName);

    const analysis = this.astParser.parseFile(code, language);
    if (!analysis) {
      return {
        fileName,
        language,
        fullCode: code,
        type: "basic",
      };
    }

    const position = editor.selection.active;
    const currentLine = position.line + 1;

    const currentFunction = analysis.functions.find(
      (f) => currentLine >= f.lineStart && currentLine <= f.lineEnd
    );

    return {
      fileName,
      language,
      type: "enhanced",
      totalFunctions: analysis.functions.length,
      totalClasses: analysis.classes.length,
      imports: analysis.imports,
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
      relatedFunctions: analysis.functions
        .filter((f) => f.name !== currentFunction?.name)
        .slice(0, 3)
        .map((f) => ({
          name: f.name,
          signature: f.signature,
          complexity: f.complexity,
        })),
      classes: analysis.classes,
    };
  }

  private _extractFunctionCode(fullCode: string, lineStart: number, lineEnd: number): string {
    const lines = fullCode.split("\n");
    return lines.slice(lineStart - 1, lineEnd).join("\n");
  }

  private _buildContextualPrompt(userMessage: string, context: any): string {
    if (context.type === "basic") {
      return `User's current code context:\n\nFile: ${context.fileName}\n\`\`\`${context.language}\n${context.fullCode}\n\`\`\`\n\nUser message: ${userMessage}`;
    }

    let prompt = `File: ${context.fileName} (${context.language})\n`;
    prompt += `Total Functions: ${context.totalFunctions}, Total Classes: ${context.totalClasses}\n\n`;

    if (context.imports.length > 0) {
      prompt += `Imports:\n${context.imports.slice(0, 5).join("\n")}\n\n`;
    }

    if (context.classes.length > 0) {
      prompt += `Classes: ${context.classes.join(", ")}\n\n`;
    }

    if (context.currentFunction) {
      prompt += `Current Function (cursor location):\n`;
      prompt += `- Name: ${context.currentFunction.name}\n`;
      prompt += `- Signature: ${context.currentFunction.signature}\n`;
      prompt += `- Complexity: ${context.currentFunction.complexity}\n`;
      prompt += `- Lines: ${context.currentFunction.lineStart}-${context.currentFunction.lineEnd}\n\n`;
      prompt += `Function Code:\n\`\`\`${context.language}\n${context.currentFunction.code}\n\`\`\`\n\n`;
    }

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

  private async _handleApplyEdit(fileName: string, content: string): Promise<void> {
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
    const htmlContent = fs.readFileSync(htmlPath.fsPath, "utf8");
    return htmlContent;
  } catch (error) {
    console.error("Failed to load chat.html:", error);
    return this._getInlineHtml();
  }
}

private _getInlineHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Dev Assistant</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            text-align: center;
        }
        h1 { margin-bottom: 10px; }
        p { color: var(--vscode-descriptionForeground); }
    </style>
</head>
<body>
    <h1>🤖 AI Dev Assistant</h1>
    <p>Chat interface is loading...</p>
    <p style="margin-top: 20px; font-size: 12px;">If this persists, check the console for errors.</p>
</body>
</html>`;
}
}