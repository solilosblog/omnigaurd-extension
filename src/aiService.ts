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

export async function askLLM(userPrompt: string): Promise<string> {
  const config = getVSCodeConfig();

  try {
    const endpoint = `${config.baseUrl}/ai-chat-gemini`;

    const response = await axios.post(
      endpoint,
      {
        message: userPrompt,
        systemPrompt: SYSTEM_PROMPT,
        codeContext: null
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 60000,
      }
    );

    const data = response.data;
    
    if (data.tokens) {
      console.log(`Tokens - Input: ${data.tokens.input}, Output: ${data.tokens.output}, Total: ${data.tokens.total}`);
    }

    return data.content || data;
  } catch (error) {
    console.error("Error calling backend:", error);
    return handleLLMError(error);
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