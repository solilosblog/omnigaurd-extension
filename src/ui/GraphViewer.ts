import * as vscode from "vscode";
import { DependencyGraph } from "../graph/DependencyGraphBuilder";
import path from "path";

export class GraphViewer {
  private panel: vscode.WebviewPanel | undefined;
  private extensionUri: vscode.Uri;

  constructor(extensionUri: vscode.Uri) {
    this.extensionUri = extensionUri;
  }

  public show(graph: DependencyGraph, mermaidDiagram: string): void {
    console.log("🖼️ Opening graph viewer...");
    
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
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            background-color: #1e1e1e;
            color: #d4d4d4;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            overflow: hidden;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        .stats-panel {
    padding: 16px;
    background-color: #252526;
    border-left: 1px solid #3e3e42;
    min-width: 280px;
    max-width: 280px;
    overflow-y: auto;
}

.stats-panel h3 {
    font-size: 14px;
    margin-bottom: 16px;
    color: #d4d4d4;
}

.stats-panel h4 {
    font-size: 12px;
    margin-bottom: 8px;
    color: #858585;
    text-transform: uppercase;
}

.stats-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 16px;
}

.stat-card {
    background-color: #1e1e1e;
    padding: 12px;
    border-radius: 4px;
    text-align: center;
}

.stat-number {
    font-size: 24px;
    font-weight: 700;
    color: #4ecdc4;
    margin-bottom: 4px;
}

.stat-label {
    font-size: 11px;
    color: #858585;
}

.complex-file-item,
.connected-file-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px;
    margin-bottom: 6px;
    background-color: #1e1e1e;
    border-radius: 4px;
    font-size: 12px;
}

.file-name {
    color: #d4d4d4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
}

.complexity-badge,
.connections-badge {
    background-color: #f7b731;
    color: #000;
    padding: 2px 8px;
    border-radius: 10px;
    font-weight: 600;
    font-size: 11px;
    margin-left: 8px;
}

.connections-badge {
    background-color: #4ecdc4;
}
        .toolbar {
            padding: 12px 16px;
            background-color: #252526;
            border-bottom: 1px solid #3e3e42;
            display: flex;
            gap: 8px;
            align-items: center;
            flex-wrap: wrap;
        }
        
        button {
            background-color: #0e639c;
            color: #ffffff;
            border: none;
            padding: 6px 12px;
            cursor: pointer;
            border-radius: 4px;
            font-size: 13px;
            font-family: inherit;
        }
        
        button:hover {
            background-color: #1177bb;
        }
        
        .zoom-level {
            color: #858585;
            font-size: 12px;
            margin-left: auto;
        }
        
        .graph-container {
            flex: 1;
            overflow: auto;
            padding: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            background-color: #1e1e1e;
        }
        
        #mermaid-diagram {
            transform-origin: center center;
            transition: transform 0.3s ease;
        }
        
        .stats {
            padding: 12px 16px;
            background-color: #252526;
            border-top: 1px solid #3e3e42;
            display: flex;
            gap: 24px;
            font-size: 12px;
        }
        
        .stat-item {
            display: flex;
            gap: 4px;
        }
        
        .stat-label {
            color: #858585;
        }
        
        .stat-value {
            font-weight: 600;
            color: #d4d4d4;
        }
        
        .legend {
            padding: 16px;
            background-color: #252526;
            border-left: 1px solid #3e3e42;
            min-width: 200px;
        }
        
        .legend h3 {
            font-size: 14px;
            margin-bottom: 12px;
            color: #d4d4d4;
        }
        
        .legend-item {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
            font-size: 12px;
        }
        
        .legend-color {
            width: 16px;
            height: 16px;
            border-radius: 3px;
            border: 2px solid #fff;
        }
        
        .main-content {
            display: flex;
            flex: 1;
            overflow: hidden;
        }
    </style>
</head>
<body>
    <div class="toolbar">
        <button onclick="zoomIn()">🔍 Zoom In</button>
        <button onclick="zoomOut()">🔍 Zoom Out</button>
        <button onclick="resetZoom()">↺ Reset</button>
        <button onclick="fitToScreen()">⛶ Fit Screen</button>
        <button onclick="exportGraph('png')">💾 Export PNG</button>
        <button onclick="exportGraph('json')">📄 Export JSON</button>
        <span class="zoom-level" id="zoomLevel">100%</span>
    </div>
    
    <div class="main-content">
        <div class="graph-container" id="graphContainer">
            <div id="mermaid-diagram">
                <pre class="mermaid">
${mermaidDiagram}
                </pre>
            </div>
        </div>
        
        <div class="legend">
            <h3>Node Types</h3>
            <div class="legend-item">
                <div class="legend-color" style="background: #ff6b6b;"></div>
                <span>Entry Point</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background: #4ecdc4;"></div>
                <span>Controller</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background: #45b7d1;"></div>
                <span>Service</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background: #f7b731;"></div>
                <span>Model</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background: #5f27cd;"></div>
                <span>Utility</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background: #00d2d3;"></div>
                <span>Test</span>
            </div>
        </div>
    </div>
    
    <div class="stats-panel">
    <h3>📊 Codebase Statistics</h3>
    <div class="stats-grid">
        <div class="stat-card">
            <div class="stat-number">${graph.nodes.length}</div>
            <div class="stat-label">Total Files</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${graph.edges.length}</div>
            <div class="stat-label">Dependencies</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${graph.nodes.reduce((sum, n) => sum + n.metrics.functions, 0)}</div>
            <div class="stat-label">Total Functions</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${graph.nodes.reduce((sum, n) => sum + n.metrics.classes, 0)}</div>
            <div class="stat-label">Total Classes</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${Math.round(graph.nodes.reduce((sum, n) => sum + n.metrics.complexity, 0) / graph.nodes.length)}</div>
            <div class="stat-label">Avg Complexity</div>
        </div>
    </div>
    
    <h4 style="margin-top: 16px;">🔥 Most Complex Files</h4>
    <div class="complex-files">
        ${graph.nodes
          .sort((a, b) => b.metrics.complexity - a.metrics.complexity)
          .slice(0, 5)
          .map(n => `
            <div class="complex-file-item">
                <span class="file-name">${path.basename(n.id)}</span>
                <span class="complexity-badge">${n.metrics.complexity}</span>
            </div>
          `).join('')}
    </div>
    
    <h4 style="margin-top: 16px;">⭐ Most Connected Files</h4>
    <div class="connected-files">
        ${graph.nodes
          .sort((a, b) => b.metrics.centralityScore - a.metrics.centralityScore)
          .slice(0, 5)
          .map(n => `
            <div class="connected-file-item">
                <span class="file-name">${path.basename(n.id)}</span>
                <span class="connections-badge">${Math.round(n.metrics.centralityScore)}</span>
            </div>
          `).join('')}
    </div>
</div>
    
    <script>
        const vscode = acquireVsCodeApi();
        
        mermaid.initialize({ 
            startOnLoad: true,
            theme: 'dark',
            themeVariables: {
                darkMode: true,
                background: '#1e1e1e',
                primaryColor: '#4ecdc4',
                primaryTextColor: '#fff',
                primaryBorderColor: '#fff',
                lineColor: '#858585',
                secondaryColor: '#45b7d1',
                tertiaryColor: '#f7b731',
                fontSize: '14px'
            },
            flowchart: {
                curve: 'basis',
                padding: 20,
                nodeSpacing: 80,
                rankSpacing: 80,
                diagramPadding: 20
            }
        });
        
        let currentZoom = 1.0;
        const zoomStep = 0.1;
        const minZoom = 0.1;
        const maxZoom = 3.0;
        
        function updateZoomDisplay() {
            document.getElementById('zoomLevel').textContent = Math.round(currentZoom * 100) + '%';
        }
        
        function applyZoom() {
            const diagram = document.getElementById('mermaid-diagram');
            diagram.style.transform = 'scale(' + currentZoom + ')';
            updateZoomDisplay();
        }
        
        function zoomIn() {
            currentZoom = Math.min(currentZoom + zoomStep, maxZoom);
            applyZoom();
        }
        
        function zoomOut() {
            currentZoom = Math.max(currentZoom - zoomStep, minZoom);
            applyZoom();
        }
        
        function resetZoom() {
            currentZoom = 1.0;
            applyZoom();
        }
        
        function fitToScreen() {
            const container = document.getElementById('graphContainer');
            const diagram = document.getElementById('mermaid-diagram');
            const containerWidth = container.clientWidth;
            const containerHeight = container.clientHeight;
            const diagramWidth = diagram.scrollWidth;
            const diagramHeight = diagram.scrollHeight;
            
            const scaleX = containerWidth / diagramWidth;
            const scaleY = containerHeight / diagramHeight;
            currentZoom = Math.min(scaleX, scaleY) * 0.9;
            applyZoom();
        }
        
        function exportGraph(format) {
            vscode.postMessage({
                type: 'exportGraph',
                format: format
            });
        }
        
        document.addEventListener('wheel', (e) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                if (e.deltaY < 0) {
                    zoomIn();
                } else {
                    zoomOut();
                }
            }
        });
        
        setTimeout(() => {
            fitToScreen();
        }, 500);
        
        updateZoomDisplay();
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