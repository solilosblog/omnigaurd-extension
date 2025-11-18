import * as vscode from "vscode";
import { ChatViewProvider } from "./ChatViewProvider";
import { CodebaseIndexer } from "./codeAnalysis/codebaseIndexer";
import { extractCurrentFunctionMetadata } from "./codeAnalysis/metadataExtractor";
import { askLLM } from "./aiService";

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

  // 🔥 NEW: Generate Unit Test Command
  const generateTestCommand = vscode.commands.registerCommand(
    "aiDevAssistant.generateTest",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor");
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Generating unit test...",
          cancellable: false,
        },
        async () => {
          try {
            // Extract metadata using Tree-sitter
            const metadata = await extractCurrentFunctionMetadata();

            if (!metadata || !metadata.function) {
              vscode.window.showWarningMessage(
                "Place cursor inside a function to generate tests"
              );
              return;
            }

            const func = metadata.function;
            const analysis = metadata.fileAnalysis;

            // Build smart prompt with AST context
            const testPrompt = `
Generate a comprehensive unit test for the following function:

File: ${metadata.fileName}
Language: ${analysis.language}

Function Details:
- Name: ${func.name}
- Signature: ${func.signature}
- Parameters: ${func.params.map((p) => `${p.name}: ${p.type}`).join(", ")}
- Return Type: ${func.returnType}
- Complexity: ${func.complexity}
- Visibility: ${func.visibility}

Function Code:
\`\`\`${analysis.language}
${extractFunctionCode(editor.document, func.lineStart, func.lineEnd)}
\`\`\`

Context - Other functions in this file:
${analysis.functions
  .filter((f) => f.name !== func.name)
  .slice(0, 3)
  .map((f) => `- ${f.signature}`)
  .join("\n")}

Classes: ${analysis.classes.join(", ") || "None"}

Imports:
${analysis.imports.slice(0, 5).join("\n") || "None"}

Requirements:
1. Generate a complete, runnable unit test
2. Cover edge cases, normal cases, and error cases
3. Include setup/teardown if needed
4. Use appropriate testing framework for ${analysis.language}
5. Add clear test descriptions
6. Mock dependencies if necessary

Generate ONLY the test code, no explanations.
`;

            const testCode = await askLLM(testPrompt);

            // Create new test file
            const testFileName = getTestFileName(metadata.fileName, analysis.language);
            const testUri = vscode.Uri.file(
              editor.document.uri.fsPath.replace(
                metadata.fileName,
                testFileName
              )
            );

            const edit = new vscode.WorkspaceEdit();
            edit.createFile(testUri, { ignoreIfExists: true });
            edit.insert(testUri, new vscode.Position(0, 0), testCode);

            const success = await vscode.workspace.applyEdit(edit);

            if (success) {
              const doc = await vscode.workspace.openTextDocument(testUri);
              await vscode.window.showTextDocument(doc);
              vscode.window.showInformationMessage(
                `✅ Generated test for ${func.name}()`
              );
            } else {
              vscode.window.showErrorMessage("Failed to create test file");
            }
          } catch (err: any) {
            vscode.window.showErrorMessage(`Test generation failed: ${err.message}`);
            console.error(err);
          }
        }
      );
    }
  );

  context.subscriptions.push(indexCommand, generateTestCommand);
}

function extractFunctionCode(
  document: vscode.TextDocument,
  lineStart: number,
  lineEnd: number
): string {
  const lines: string[] = [];
  for (let i = lineStart - 1; i < lineEnd; i++) {
    lines.push(document.lineAt(i).text);
  }
  return lines.join("\n");
}

function getTestFileName(fileName: string, language: string): string {
  const nameWithoutExt = fileName.replace(/\.[^/.]+$/, "");
  
  switch (language) {
    case "java":
      return `${nameWithoutExt}Test.java`;
    case "javascript":
    case "javascriptreact":
      return `${nameWithoutExt}.test.js`;
    case "typescript":
    case "typescriptreact":
      return `${nameWithoutExt}.test.ts`;
    case "python":
      return `test_${nameWithoutExt}.py`;
    default:
      return `${nameWithoutExt}.test.${language}`;
  }
}

export function deactivate() {
  console.log("AI Dev Assistant deactivated");
}