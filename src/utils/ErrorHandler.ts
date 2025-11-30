export interface RetryConfig {
  maxAttempts: number;
  backoffMs: number[];
  retryableErrors: string[];
}

export interface ParseResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  partialData?: T;
  suggestion?: string;
}

export class ErrorHandler {
  private config: RetryConfig;

  constructor(config?: Partial<RetryConfig>) {
    this.config = {
      maxAttempts: 3,
      backoffMs: [100, 500, 2000],
      retryableErrors: ["EBUSY", "EAGAIN", "PARSE_TIMEOUT"],
      ...config,
    };
  }

  public async executeWithRetry<T>(
    operation: () => Promise<T>
  ): Promise<ParseResult<T>> {
    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        const result = await operation();
        return {
          success: true,
          data: result,
        };
      } catch (error: any) {
        if (this.isRetryable(error) && attempt < this.config.maxAttempts) {
          await this.delay(this.config.backoffMs[attempt - 1]);
          continue;
        }

        return this.handleError(error);
      }
    }

    return {
      success: false,
      error: "Max retry attempts exceeded",
    };
  }

  private isRetryable(error: any): boolean {
    const errorCode = error.code || error.name || "";
    return this.config.retryableErrors.some((e) => errorCode.includes(e));
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private handleError<T>(error: any): ParseResult<T> {
    return {
      success: false,
      error: error.message || "Unknown error",
      suggestion: this.getSuggestion(error),
    };
  }

  private getSuggestion(error: any): string {
    if (error.message?.includes("syntax")) {
      return "Fix syntax errors in the file";
    }
    if (error.message?.includes("permission")) {
      return "Grant file access permissions";
    }
    if (error.message?.includes("not found")) {
      return "Verify file exists";
    }
    return "Check error details and try again";
  }
}