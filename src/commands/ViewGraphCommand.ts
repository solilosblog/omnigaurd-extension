import * as vscode from "vscode";
import { DependencyGraphBuilder } from "../graph/DependencyGraphBuilder";
import { GraphViewer } from "../ui/GraphViewer";
import { CacheManager } from "../utils/CacheManager";
import { DependencyResolver } from "../core/DependencyResolver";

export class ViewGraphCommand {
  constructor(
    private graphViewer: GraphViewer,
    private cacheManager: CacheManager
  ) {}

  public async execute(): Promise<void> {
    const index = this.cacheManager.loadIndex();

    if (!index || index.files.size === 0) {
      const response = await vscode.window.showWarningMessage(
        "Workspace not indexed. Index now?",
        "Yes",
        "No"
      );

      if (response === "Yes") {
        await vscode.commands.executeCommand("aiDevAssistant.indexCodebase");
      }
      return;
    }

    const dependencyResolver = new DependencyResolver(index);
    const graphBuilder = new DependencyGraphBuilder(index, dependencyResolver);
    const graph = graphBuilder.buildGraph();
    const mermaidDiagram = graphBuilder.generateMermaid(graph);

    this.graphViewer.show(graph, mermaidDiagram);
  }
}