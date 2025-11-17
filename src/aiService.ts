import axios, { AxiosError } from "axios";
import * as vscode from "vscode";

/**
 * Helper to get latest configuration from VS Code settings
 */
function getVSCodeConfig() {
  const config = vscode.workspace.getConfiguration("aiDevAssistant");

  return {
    // Backend base URL
    baseUrl: config.get<string>("baseUrl") || "http://localhost:8080/api",
    // AI provider: "openai" or "gemini"
    provider: config.get<string>("provider") || "gemini",
    maxTokens: config.get<number>("maxTokens") || 2000,
    temperature: config.get<number>("temperature") || 0.7,
  };
}

/**
 * System prompt that defines the AI assistant's behavior
 */
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
4. Suggest terminal commands only when necessary

Keep responses concise but thorough. Format code using markdown code blocks with language identifiers.`;

/**
 * Send a prompt to the LLM and return a response
 */
/**
 * Send a prompt to the LLM and return a response
 */
export async function askLLM(userPrompt: string): Promise<string> {
  const config = getVSCodeConfig();

  try {
    // Combine system prompt with user prompt
    const fullPrompt = `${SYSTEM_PROMPT}\n\nUser: ${userPrompt}`;

    // Determine which endpoint to use based on provider
    const endpoint =  `${config.baseUrl}/ai-chat-gemini`;

    console.log(`Calling endpoint: ${endpoint}`); // Debug log

    // Call your Spring Boot backend with POST
    const response = await axios.post(
      endpoint,
      { message: fullPrompt }, // Make sure this matches ChatRequest
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 60000,
      }
    );

    const aiResponse = response.data;
    if (!aiResponse) throw new Error("No response received from backend");

    return aiResponse.trim();
  } catch (error) {
    console.error("Error calling backend:", error); // Debug log
    return handleLLMError(error);
  }
}

/**
 * Handle LLM API errors gracefully
 */
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

/**
 * Quick connectivity test
 */
export async function testLLMConnection(): Promise<boolean> {
  try {
    const reply = await askLLM(
      'Hello, this is a test. Please reply with "OK".'
    );
    return reply.includes("OK");
  } catch {
    return false;
  }
}

/**
 * Expose config for debugging
 */
export function getConfigStatus() {
  const config = getVSCodeConfig();
  return {
    baseUrl: config.baseUrl,
    provider: config.provider,
    maxTokens: config.maxTokens,
    temperature: config.temperature,
  };
}