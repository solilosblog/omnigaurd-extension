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

  try {
    const endpoint = `${config.baseUrl}/ai-chat-gemini`;

    const requestBody = {
      message: userPrompt,
      systemPrompt: SYSTEM_PROMPT,
      codebaseContext: codebaseContext || null,
    };

    console.log("=== AI REQUEST ===");
    console.log("Endpoint:", endpoint);
    console.log("Message length:", userPrompt.length);
    console.log("Has codebase context:", !!codebaseContext);
    if (codebaseContext) {
      console.log("Context files:", codebaseContext.files?.length || 0);
    }

    const response = await axios.post(endpoint, requestBody, {
      headers: { "Content-Type": "application/json" },
      timeout: 120000,
    });

    if (!response.data) {
      throw new Error("Empty response from backend");
    }

    const data = response.data;

    if (data.tokens) {
      console.log(`✅ Tokens - Input: ${data.tokens.input}, Output: ${data.tokens.output}`);
    }

    const content = data.content || data;
    
    if (!content || content.length === 0) {
      throw new Error("Empty content in response");
    }
    console.log(userPrompt,'\n\n\n')
    console.log(content);
    
    return content;
  } catch (error) {
    console.error("❌ AI Service Error:", error);
    
    if (axios.isAxiosError(error)) {
      const err = error as AxiosError;
      
      if (err.code === 'ECONNREFUSED') {
        throw new Error("Backend server is not running. Please start the Spring Boot server.");
      }
      
      if (err.response) {
        console.error("Response error:", err.response.status, err.response.data);
        throw new Error(`Backend error: ${err.response.status} - ${JSON.stringify(err.response.data)}`);
      }
      
      if (err.request) {
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