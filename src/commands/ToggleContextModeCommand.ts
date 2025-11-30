import * as vscode from "vscode";

export type ContextMode = "single" | "smart" | "workspace" | "custom";

export class ToggleContextModeCommand {
  private currentMode: ContextMode = "smart";

  public async execute(): Promise<void> {
    const modes: Array<{ label: string; value: ContextMode; description: string }> = [
      {
        label: "📄 Single File Mode",
        value: "single",
        description: "Current file only",
      },
      {
        label: "📁 Smart Mode",
        value: "smart",
        description: "Current file + dependencies",
      },
      {
        label: "🌍 Workspace Mode",
        value: "workspace",
        description: "Full codebase batches",
      },
      {
        label: "🎯 Custom Selection",
        value: "custom",
        description: "Manual file picker",
      },
    ];

    const selected = await vscode.window.showQuickPick(modes, {
      placeHolder: "Select context mode",
    });

    if (selected) {
      this.currentMode = selected.value;
      
      const config = vscode.workspace.getConfiguration("aiDevAssistant");
      await config.update("contextMode.default", this.currentMode, true);

      vscode.window.showInformationMessage(`Context mode: ${selected.label}`);
    }
  }

  public getCurrentMode(): ContextMode {
    return this.currentMode;
  }
}