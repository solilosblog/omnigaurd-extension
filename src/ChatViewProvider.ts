import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { askLLM } from "./aiService";

/**
 * ChatViewProvider manages the webview sidebar panel
 * Implements vscode.WebviewViewProvider interface
 * Handles message passing between webview and extension host
 */
export class ChatViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _extensionUri: vscode.Uri;
  private _isTrusted: boolean;

  constructor(extensionUri: vscode.Uri, isTrusted: boolean) {
    this._extensionUri = extensionUri;
    this._isTrusted = isTrusted;
  }

  /**
   * Called when the view is first created
   * Sets up the webview with HTML content and message handlers
   */
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    // Configure webview options
    webviewView.webview.options = {
      enableScripts: true, // Allow JavaScript in webview
      localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, "media")],
    };

    // Set the HTML content for the webview
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (message) => {
      await this._handleWebviewMessage(message);
    });
  }

  /**
   * Handle messages received from the webview
   * Routes different message types to appropriate handlers
   */
  private async _handleWebviewMessage(message: any) {
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

  /**
   * Handle chat message from user
   * Gathers code context and sends to LLM
   */
  private async _handleChatMessage(userMessage: string) {
    try {
      // Show "thinking" indicator in webview
      this._sendMessageToWebview({
        type: "assistantThinking",
        thinking: true,
      });

      // Gather code context from active editor
      const codeContext = await this._getCodeContext();

      // Build context string for LLM
      let fullPrompt = userMessage;
      if (codeContext) {
        fullPrompt = `User's current code context:\n\nFile: ${codeContext.fileName}\n\`\`\`${codeContext.language}\n${codeContext.content}\n\`\`\`\n\nUser message: ${userMessage}`;
      }

      // Call LLM service
      const response = await askLLM(fullPrompt);

      // Hide "thinking" indicator
      this._sendMessageToWebview({
        type: "assistantThinking",
        thinking: false,
      });

      // Send AI response back to webview
      this._sendMessageToWebview({
        type: "assistantMessage",
        text: response,
      });
    } catch (error: any) {
      // Hide "thinking" indicator on error
      this._sendMessageToWebview({
        type: "assistantThinking",
        thinking: false,
      });

      // Show error message in webview
      this._sendMessageToWebview({
        type: "assistantMessage",
        text: `❌ Error: ${error.message || "Failed to get response from AI"}`,
      });

      vscode.window.showErrorMessage(`AI Dev Assistant: ${error.message}`);
    }
  }

  /**
   * Get code context from the active editor
   * Returns file name, language, and content
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

  /**
   * Handle applying an edit to a file
   * Opens the file and replaces its content
   */
  private async _handleApplyEdit(fileName: string, content: string) {
    try {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor to apply edit");
        return;
      }

      // Create edit to replace entire document
      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(
        editor.document.positionAt(0),
        editor.document.positionAt(editor.document.getText().length)
      );
      edit.replace(editor.document.uri, fullRange, content);

      // Apply the edit
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

  /**
   * Handle showing diff view
   * Delegates to command registered in extension.ts
   */
  private async _handleShowDiff(
    original: string,
    suggested: string,
    fileName: string
  ) {
    await vscode.commands.executeCommand(
      "aiDevAssistant.showDiff",
      original,
      suggested,
      fileName
    );
  }

  /**
   * Handle running a terminal command
   * Delegates to command registered in extension.ts
   */
  private async _handleRunCommand(command: string) {
    await vscode.commands.executeCommand("aiDevAssistant.runCommand", command);
  }

  /**
   * Send a message from extension host to webview
   */
  private _sendMessageToWebview(message: any) {
    if (this._view) {
      this._view.webview.postMessage(message);
    }
  }

  /**
   * Generate HTML content for the webview
   * Loads chat.html file from media folder
   */
  private _getHtmlForWebview(webview: vscode.Webview): string {
    const htmlPath = vscode.Uri.joinPath(
      this._extensionUri,
      "media",
      "chat.html"
    );

    // Try to read the HTML file
    try {
      const htmlContent = fs.readFileSync(htmlPath.fsPath, "utf8");
      return htmlContent;
    } catch (error) {
      // If file doesn't exist, return inline HTML
      return this._getInlineHtml();
    }
  }
  /*************  ✨ Windsurf Command ⭐  *************/
  /**
   * Returns inline HTML content to be used as a fallback if the chat.html file is not found.
   * The inline HTML includes the complete chat UI with Tailwind CSS.
   */
  /*******  6b1260c0-53ac-4509-8c48-b75b3f8b0c90  *******/
  private _getInlineHtml(): string {
    return ``;
  }

  /**
   * Fallback inline HTML if chat.html file is not found
   * Includes complete chat UI with Tailwind CSS
   */
  //     private _getInlineHtml(): string {
  //         return `<!DOCTYPE html>
  // <html lang="en">
  // <head>
  //     <meta charset="UTF-8">
  //     <meta name="viewport" content="width=device-width, initial-scale=1.0">
  //     <title>AI Dev Assistant</title>
  //     <script src="https://cdn.tailwindcss.com"></script>
  //     <style>
  //         body { overflow: hidden; }
  //         .chat-container { height: calc(100vh - 80px); }
  //         .markdown-content pre { background: #1e1e1e; padding: 12px; border-radius: 6px; overflow-x: auto; }
  //         .markdown-content code { background: #2d2d2d; padding: 2px 6px; border-radius: 3px; font-family: 'Courier New', monospace; }
  //     </style>
  // </head>
  // <body class="bg-gray-900 text-gray-100">
  //     <div class="flex flex-col h-screen">
  //         <div class="p-4 bg-gray-800 border-b border-gray-700">
  //             <h1 class="text-xl font-bold">AI Dev Assistant</h1>
  //         </div>

  //         <div id="messages" class="flex-1 overflow-y-auto p-4 space-y-4 chat-container">
  //             <div class="text-gray-400 text-sm text-center">Start a conversation with your AI assistant</div>
  //         </div>

  //         <div id="thinking" class="hidden px-4 py-2 bg-gray-800 border-t border-gray-700">
  //             <div class="flex items-center space-x-2">
  //                 <div class="animate-pulse text-blue-400">●</div>
  //                 <span class="text-sm text-gray-400">AI is thinking...</span>
  //             </div>
  //         </div>

  //         <div class="p-4 bg-gray-800 border-t border-gray-700">
  //             <div class="flex space-x-2">
  //                 <input type="text" id="messageInput" placeholder="Ask me anything..."
  //                     class="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
  //                 <button id="sendButton" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">
  //                     Send
  //                 </button>
  //             </div>
  //         </div>
  //     </div>

  //     <script>
  //         const vscode = acquireVsCodeApi();
  //         const messagesDiv = document.getElementById('messages');
  //         const messageInput = document.getElementById('messageInput');
  //         const sendButton = document.getElementById('sendButton');
  //         const thinkingDiv = document.getElementById('thinking');

  //         function addMessage(text, isUser = false) {
  //             const messageDiv = document.createElement('div');
  //             messageDiv.className = isUser
  //                 ? 'flex justify-end'
  //                 : 'flex justify-start';

  //             const bubble = document.createElement('div');
  //             bubble.className = isUser
  //                 ? 'bg-blue-600 text-white px-4 py-2 rounded-lg max-w-[80%]'
  //                 : 'bg-gray-700 text-gray-100 px-4 py-2 rounded-lg max-w-[80%] markdown-content';

  //             if (isUser) {
  //                 bubble.textContent = text;
  //             } else {
  //                 bubble.innerHTML = formatMarkdown(text);
  //             }

  //             messageDiv.appendChild(bubble);
  //             messagesDiv.appendChild(messageDiv);
  //             messagesDiv.scrollTop = messagesDiv.scrollHeight;
  //         }

  //         function formatMarkdown(text) {
  //             // Basic markdown formatting
  //             text = text.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  //             text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  //             text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  //             text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  //             text = text.replace(/\n/g, '<br>');
  //             return text;
  //         }

  //         function sendMessage() {
  //             const text = messageInput.value.trim();
  //             if (!text) return;

  //             addMessage(text, true);
  //             vscode.postMessage({ type: 'sendMessage', text: text });
  //             messageInput.value = '';
  //         }

  //         sendButton.addEventListener('click', sendMessage);
  //         messageInput.addEventListener('keypress', (e) => {
  //             if (e.key === 'Enter') sendMessage();
  //         });

  //         window.addEventListener('message', (event) => {
  //             const message = event.data;

  //             switch (message.type) {
  //                 case 'assistantMessage':
  //                     addMessage(message.text, false);
  //                     break;
  //                 case 'assistantThinking':
  //                     thinkingDiv.classList.toggle('hidden', !message.thinking);
  //                     break;
  //             }
  //         });
  //     </script>
  // </body>
  // </html>`;
  //     }
  // }
}
