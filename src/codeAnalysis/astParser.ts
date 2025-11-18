import Parser from "tree-sitter";

export interface FunctionMetadata {
  name: string;
  signature: string;
  params: Array<{ type: string; name: string }>;
  returnType: string;
  lineStart: number;
  lineEnd: number;
  visibility?: string;
  complexity: number;
}

export interface FileAnalysis {
  fileName: string;
  language: string;
  functions: FunctionMetadata[];
  classes: string[];
  imports: string[];
}

export class ASTParser {
  private parsers: Map<string, Parser>;

  constructor() {
    this.parsers = new Map();
    this.initializeParsers();
  }

  private initializeParsers() {
    try {
      const Java = require("tree-sitter-java");
      const javaParser = new Parser();
      javaParser.setLanguage(Java);
      this.parsers.set("java", javaParser);
    } catch (e) {
      console.log("Java parser not available");
    }

    try {
      const JavaScript = require("tree-sitter-javascript");
      const jsParser = new Parser();
      jsParser.setLanguage(JavaScript);
      this.parsers.set("javascript", jsParser);
      this.parsers.set("javascriptreact", jsParser);
    } catch (e) {
      console.log("JavaScript parser not available");
    }

    try {
      const TypeScript = require("tree-sitter-typescript");
      const tsParser = new Parser();
      tsParser.setLanguage(TypeScript.typescript);
      this.parsers.set("typescript", tsParser);
      this.parsers.set("typescriptreact", tsParser);
    } catch (e) {
      console.log("TypeScript parser not available");
    }

    try {
      const Python = require("tree-sitter-python");
      const pyParser = new Parser();
      pyParser.setLanguage(Python);
      this.parsers.set("python", pyParser);
    } catch (e) {
      console.log("Python parser not available");
    }
  }

  public parseFile(code: string, language: string): FileAnalysis | null {
    const parser = this.parsers.get(language);
    if (!parser) {
      return null;
    }

    try {
      const tree = parser.parse(code);
      const rootNode = tree.rootNode;

      const analysis: FileAnalysis = {
        fileName: "",
        language,
        functions: [],
        classes: [],
        imports: [],
      };

      this.walkTree(rootNode, code, analysis);
      return analysis;
    } catch (error) {
      console.error("Error parsing file:", error);
      return null;
    }
  }

  private walkTree(node: any, code: string, analysis: FileAnalysis) {
    if (node.type === "method_declaration" || node.type === "function_declaration") {
      const funcMetadata = this.extractFunctionMetadata(node, code);
      if (funcMetadata) {
        analysis.functions.push(funcMetadata);
      }
    }

    if (node.type === "class_declaration") {
      const className = this.getNodeText(node.childForFieldName("name"), code);
      if (className) {
        analysis.classes.push(className);
      }
    }

    if (node.type === "import_declaration" || node.type === "import_statement") {
      const importText = this.getNodeText(node, code);
      if (importText) {
        analysis.imports.push(importText);
      }
    }

    for (const child of node.children) {
      this.walkTree(child, code, analysis);
    }
  }

  private extractFunctionMetadata(node: any, code: string): FunctionMetadata | null {
    const name = this.getNodeText(node.childForFieldName("name"), code);
    if (!name) {
      return null;
    }

    const params = this.extractParameters(node.childForFieldName("parameters"), code);
    const returnType = this.extractReturnType(node, code);
    const visibility = this.extractVisibility(node, code);

    return {
      name,
      signature: this.getNodeText(node, code).split("{")[0].trim(),
      params,
      returnType,
      lineStart: node.startPosition.row + 1,
      lineEnd: node.endPosition.row + 1,
      visibility,
      complexity: this.calculateComplexity(node),
    };
  }

  private extractParameters(paramsNode: any, code: string): Array<{ type: string; name: string }> {
    if (!paramsNode) {
      return [];
    }
    
    const params: Array<{ type: string; name: string }> = [];

    for (const child of paramsNode.children) {
      if (child.type === "formal_parameter" || child.type === "parameter") {
        const typeNode = child.childForFieldName("type");
        const nameNode = child.childForFieldName("name");
        params.push({
          type: typeNode ? this.getNodeText(typeNode, code) : "unknown",
          name: nameNode ? this.getNodeText(nameNode, code) : "unknown",
        });
      }
    }
    return params;
  }

  private extractReturnType(node: any, code: string): string {
    const typeNode = node.childForFieldName("type");
    return typeNode ? this.getNodeText(typeNode, code) : "void";
  }

  private extractVisibility(node: any, code: string): string {
    for (const child of node.children) {
      if (child.type === "modifiers") {
        const text = this.getNodeText(child, code);
        if (text.includes("public")) return "public";
        if (text.includes("private")) return "private";
        if (text.includes("protected")) return "protected";
      }
    }
    return "package";
  }

  private calculateComplexity(node: any): number {
    let complexity = 1;
    const complexityNodes = ["if_statement", "for_statement", "while_statement", "case", "catch"];

    const traverse = (n: any) => {
      if (complexityNodes.includes(n.type)) {
        complexity++;
      }
      for (const child of n.children) {
        traverse(child);
      }
    };

    traverse(node);
    return complexity;
  }

  private getNodeText(node: any, code: string): string {
    if (!node) {
      return "";
    }
    return code.substring(node.startIndex, node.endIndex);
  }
}