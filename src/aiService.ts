import axios, { AxiosError } from "axios";
import * as vscode from "vscode";

function getVSCodeConfig() {
  const config = vscode.workspace.getConfiguration("aiDevAssistant");
  return {
    baseUrl: config.get<string>("baseUrl") || "http://localhost:8080/api",
    provider: config.get<string>("provider") || "gemini",
  };
}

const SYSTEM_PROMPT = `You are an AI coding assistant integrated into VS Code. You help developers with:
- Code review and suggestions
- Bug fixing and debugging
- Writing new code
- Explaining code concepts
- Refactoring and optimization
- Writing unit tests

When suggesting code changes:
1. Provide clear explanations
2. Show complete code blocks with proper syntax highlighting
3. Explain the reasoning behind changes

Keep responses concise but thorough.`;


export async function askLLM(userPrompt: string, codebaseContext?: any): Promise<string> {
  const config = getVSCodeConfig();

  console.log("╔════════════════════════════════════════╗");
  console.log("║       AI SERVICE REQUEST START         ║");
  console.log("╚════════════════════════════════════════╝");
  console.log("📍 Endpoint:", config.baseUrl);
  console.log("📝 User Prompt Length:", userPrompt.length, "characters");
  console.log("📝 User Prompt Preview:", userPrompt.substring(0, 100) + "...");
  
  if (codebaseContext) {
    console.log("📦 Codebase Context Detected:");
    console.log("  ├─ Mode:", codebaseContext.mode);
    console.log("  ├─ Batch:", codebaseContext.batchNumber, "/", codebaseContext.totalBatches);
    console.log("  ├─ Files in batch:", codebaseContext.files?.length || 0);
    console.log("  ├─ Graph nodes:", codebaseContext.graph?.metadata?.dependencyGraph?.nodes?.length || 0);
    console.log("  └─ Graph edges:", codebaseContext.graph?.metadata?.dependencyGraph?.edges?.length || 0);
    
    if (codebaseContext.files && codebaseContext.files.length > 0) {
      console.log("📂 Files in this batch:");
      codebaseContext.files.forEach((file: any, index: number) => {
        console.log(`  ${index + 1}. ${file.path} (${file.language})`);
      });
    }
  } else {
    console.log("📄 Single file context mode");
  }

  try {
    const endpoint = `${config.baseUrl}/ai-chat-gemini`;

    const requestBody = {
      message: userPrompt,
      systemPrompt: SYSTEM_PROMPT,
      codebaseContext: codebaseContext || null,
    };

    console.log("🚀 Sending request to backend...");
    const startTime = Date.now();

    const response = await axios.post(endpoint, requestBody, {
      headers: { "Content-Type": "application/json" },
      timeout: 120000,
    });

    const endTime = Date.now();
    console.log("✅ Response received in", endTime - startTime, "ms");

    if (!response.data) {
      throw new Error("Empty response from backend");
    }

    const data = response.data;

    if (data.tokens) {
      console.log("📊 Token Usage:");
      console.log("  ├─ Input:", data.tokens.input);
      console.log("  ├─ Output:", data.tokens.output);
      console.log("  └─ Total:", data.tokens.total);
    }

    const content = data.content || data;
    
    if (!content || content.length === 0) {
      throw new Error("Empty content in response");
    }

    console.log("📤 Response Length:", content.length, "characters");
    console.log("📤 Response Preview:", content.substring(0, 200) + "...");
    console.log("╔════════════════════════════════════════╗");
    console.log("║       AI SERVICE REQUEST END           ║");
    console.log("╚════════════════════════════════════════╝");

    return content;
  } catch (error) {
    console.error("╔════════════════════════════════════════╗");
    console.error("║       AI SERVICE ERROR                 ║");
    console.error("╚════════════════════════════════════════╝");
    console.error("❌ Error details:", error);
    
    if (axios.isAxiosError(error)) {
      const err = error as AxiosError;
      
      if (err.code === 'ECONNREFUSED') {
        console.error("🔌 Connection refused - backend not running");
        throw new Error("Backend server is not running. Please start the Spring Boot server on " + config.baseUrl);
      }
      
      if (err.response) {
        console.error("📛 Response Error:");
        console.error("  ├─ Status:", err.response.status);
        console.error("  └─ Data:", JSON.stringify(err.response.data, null, 2));
        throw new Error(`Backend error: ${err.response.status} - ${JSON.stringify(err.response.data)}`);
      }
      
      if (err.request) {
        console.error("📭 No response received from backend");
        throw new Error("No response from backend. Check if server is running on " + config.baseUrl);
      }
    }
    
    throw error;
  }
}

function handleLLMError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const err = error as AxiosError;
    const status = err.response?.status;
    const data = err.response?.data as any;

    switch (status) {
      case 401:
        return "❌ Authentication failed with backend.";
      case 429:
        return "❌ Rate limit exceeded. Please try again later.";
      case 500:
      case 502:
      case 503:
        return "❌ Backend service is temporarily unavailable.";
      default:
        return `❌ API Error (${status || "unknown"}): ${
          data?.error?.message || err.message
        }`;
    }
  }

  return `❌ Error: ${
    error instanceof Error ? error.message : "Unknown error occurred"
  }`;
}

export async function testLLMConnection(): Promise<boolean> {
  try {
    const reply = await askLLM('Hello, this is a test. Please reply with "OK".');
    return reply.includes("OK");
  } catch {
    return false;
  }
}

export function getConfigStatus() {
  const config = getVSCodeConfig();
  return {
    baseUrl: config.baseUrl,
    provider: config.provider,
  };
}