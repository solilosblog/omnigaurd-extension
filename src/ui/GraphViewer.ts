import * as vscode from "vscode";
import { DependencyGraph } from "../graph/DependencyGraphBuilder";

export class GraphViewer {
  private panel: vscode.WebviewPanel | undefined;
  private extensionUri: vscode.Uri;

  constructor(extensionUri: vscode.Uri) {
    this.extensionUri = extensionUri;
  }

  public show(graph: DependencyGraph, mermaidDiagram: string): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
    } else {
      this.panel = vscode.window.createWebviewPanel(
        "dependencyGraph",
        "Dependency Graph",
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        }
      );

      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });
    }

    this.panel.webview.html = this.getWebviewContent(graph, mermaidDiagram);

    this.panel.webview.onDidReceiveMessage((message) => {
      this.handleMessage(message);
    });
  }

  private handleMessage(message: any): void {
    switch (message.type) {
      case "openFile":
        this.openFile(message.filePath);
        break;
      case "exportGraph":
        this.exportGraph(message.format);
        break;
    }
  }

  private async openFile(filePath: string): Promise<void> {
    try {
      const uri = vscode.Uri.file(filePath);
      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open file: ${filePath}`);
    }
  }

  private async exportGraph(format: string): Promise<void> {
    vscode.window.showInformationMessage(`Export as ${format} - Coming soon!`);
  }

  private getWebviewContent(graph: DependencyGraph, mermaidDiagram: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dependency Graph</title>
    <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
    <style>
        body {
            margin: 0;
            padding: 20px;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-font-family);
        }
        .container {
            max-width: 100%;
            overflow: auto;
        }
        .toolbar {
            margin-bottom: 20px;
            padding: 10px;
            background-color: var(--vscode-editorWidget-background);
            border-radius: 4px;
        }
        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            margin-right: 8px;
            cursor: pointer;
            border-radius: 4px;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .graph-container {
            background-color: var(--vscode-editor-background);
            padding: 20px;
            border-radius: 4px;
            overflow: auto;
        }
        .stats {
            margin-top: 20px;
            padding: 15px;
            background-color: var(--vscode-editorWidget-background);
            border-radius: 4px;
        }
        .stats h3 {
            margin-top: 0;
        }
        .stat-item {
            margin: 8px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="toolbar">
            <button onclick="zoomIn()">Zoom In</button>
            <button onclick="zoomOut()">Zoom Out</button>
            <button onclick="resetZoom()">Reset</button>
            <button onclick="exportGraph('png')">Export PNG</button>
            <button onclick="exportGraph('json')">Export JSON</button>
        </div>
        
        <div class="graph-container" id="graph-container">
            <div class="mermaid">
                ${mermaidDiagram}
            </div>
        </div>
        
        <div class="stats">
            <h3>Graph Statistics</h3>
            <div class="stat-item">Total Nodes: ${graph.nodes.length}</div>
            <div class="stat-item">Total Edges: ${graph.edges.length}</div>
            <div class="stat-item">Average Dependencies: ${(
              graph.edges.length / graph.nodes.length
            ).toFixed(2)}</div>
        </div>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        mermaid.initialize({ startOnLoad: true, theme: 'dark' });
        
        let currentZoom = 1.0;
        
        function zoomIn() {
            currentZoom += 0.1;
            applyZoom();
        }
        
        function zoomOut() {
            currentZoom = Math.max(0.1, currentZoom - 0.1);
            applyZoom();
        }
        
        function resetZoom() {
            currentZoom = 1.0;
            applyZoom();
        }
        
        function applyZoom() {
            const container = document.getElementById('graph-container');
            container.style.transform = 'scale(' + currentZoom + ')';
        }
        
        function exportGraph(format) {
            vscode.postMessage({
                type: 'exportGraph',
                format: format
            });
        }
        
        document.querySelectorAll('.node').forEach(node => {
            node.addEventListener('click', (e) => {
                const filePath = e.target.getAttribute('data-file');
                if (filePath) {
                    vscode.postMessage({
                        type: 'openFile',
                        filePath: filePath
                    });
                }
            });
        });
    </script>
</body>
</html>`;
  }

  public dispose(): void {
    if (this.panel) {
      this.panel.dispose();
    }
  }
}