import * as vscode from "vscode";
import { ASTParser } from "./astParser";

export async function extractCurrentFunctionMetadata() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return null;

  const document = editor.document;
  const position = editor.selection.active;
  const code = document.getText();
  const language = document.languageId;

  const parser = new ASTParser();
  const analysis = parser.parseFile(code, language);
  if (!analysis) return null;

  const currentLine = position.line + 1;
  const currentFunction = analysis.functions.find(
    (f) => currentLine >= f.lineStart && currentLine <= f.lineEnd
  );

  return {
    function: currentFunction,
    fileAnalysis: analysis,
    fileName: document.fileName,
  };
}