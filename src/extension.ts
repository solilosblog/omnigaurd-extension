import * as vscode from "vscode";
import { ChatViewProvider } from "./ChatViewProvider";
import { ASTParser } from "./codeAnalysis/astParser";
import { FileFilter } from "./utils/FileFilter";
import { ErrorHandler } from "./utils/ErrorHandler";
import { CacheManager } from "./utils/CacheManager";
import { WorkspaceIndexer } from "./core/WorkspaceIndexer";
import { StatusBarManager } from "./ui/StatusBarManager";
import { ProgressReporter } from "./ui/ProgressReporter";
import { GraphViewer } from "./ui/GraphViewer";
import { IndexCommand } from "./commands/IndexCommand";
import { ViewGraphCommand } from "./commands/ViewGraphCommand";
import { ToggleContextModeCommand } from "./commands/ToggleContextModeCommand";
import { extractCurrentFunctionMetadata } from "./codeAnalysis/metadataExtractor";
import { askLLM } from "./aiService";
export function activate(context: vscode.ExtensionContext) {
  console.log("AI Dev Assistant activated");

  const cacheManager = new CacheManager(context);
  const astParser = new ASTParser();
  const fileFilter = new FileFilter();
  const errorHandler = new ErrorHandler();
  const statusBar = new StatusBarManager();
  const progressReporter = new ProgressReporter();
  const graphViewer = new GraphViewer(context.extensionUri);

  const workspaceIndexer = new WorkspaceIndexer(
    astParser,
    fileFilter,
    errorHandler,
    cacheManager
  );

  const chatProvider = new ChatViewProvider(context.extensionUri, true, cacheManager);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("aiDevAssistant.chat", chatProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  const indexCommand = new IndexCommand(workspaceIndexer, statusBar, progressReporter);
  const viewGraphCommand = new ViewGraphCommand(graphViewer, cacheManager);
  const toggleContextCommand = new ToggleContextModeCommand();

  // Auto-index on activation if enabled
  const config = vscode.workspace.getConfiguration("aiDevAssistant");
  const autoIndex = config.get<boolean>("indexing.autoIndexOnOpen");
  
  if (autoIndex && vscode.workspace.workspaceFolders) {
    const cachedIndex = cacheManager.loadIndex();
    if (!cachedIndex) {
      vscode.window.showInformationMessage(
        "AI Dev Assistant: Indexing workspace in background...",
        "View Progress"
      ).then(selection => {
        if (selection === "View Progress") {
          indexCommand.execute();
        }
      });
      
      indexCommand.execute();
    } else {
      statusBar.setStatus("ready", cachedIndex.files.size);
    }
  }

  // Register all commands...
  context.subscriptions.push(
    vscode.commands.registerCommand("aiDevAssistant.indexCodebase", async () => {
      await indexCommand.execute();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("aiDevAssistant.viewGraph", async () => {
      await viewGraphCommand.execute();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("aiDevAssistant.toggleContextMode", async () => {
      await toggleContextCommand.execute();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("aiDevAssistant.showIndexStatus", async () => {
      const index = cacheManager.loadIndex();
      if (index) {
        vscode.window.showInformationMessage(
          `Indexed: ${index.files.size} files, ${index.totalFunctions} functions, ${index.totalClasses} classes`
        );
      } else {
        vscode.window.showWarningMessage("Workspace not indexed");
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("aiDevAssistant.generateTest", async () => {
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
            const metadata = await extractCurrentFunctionMetadata();

            if (!metadata || !metadata.function) {
              vscode.window.showWarningMessage(
                "Place cursor inside a function to generate tests"
              );
              return;
            }

            const func = metadata.function;
            const analysis = metadata.fileAnalysis;

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

            const testFileName = getTestFileName(metadata.fileName, analysis.language);
            const testUri = vscode.Uri.file(
              editor.document.uri.fsPath.replace(metadata.fileName, testFileName)
            );

            const edit = new vscode.WorkspaceEdit();
            edit.createFile(testUri, { ignoreIfExists: true });
            edit.insert(testUri, new vscode.Position(0, 0), testCode);

            const success = await vscode.workspace.applyEdit(edit);

            if (success) {
              const doc = await vscode.workspace.openTextDocument(testUri);
              await vscode.window.showTextDocument(doc);
              vscode.window.showInformationMessage(`✅ Generated test for ${func.name}()`);
            } else {
              vscode.window.showErrorMessage("Failed to create test file");
            }
          } catch (err: any) {
            vscode.window.showErrorMessage(`Test generation failed: ${err.message}`);
            console.error(err);
          }
        }
      );
    })
  );

  const watcher = vscode.workspace.createFileSystemWatcher("**/*.{java,ts,js,py}");

  watcher.onDidChange(async (uri) => {
    await workspaceIndexer.updateFile(uri);
    statusBar.setStatus("ready");
  });

  context.subscriptions.push(watcher, statusBar, graphViewer);
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