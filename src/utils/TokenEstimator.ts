export class TokenEstimator {
  private readonly CHARS_PER_TOKEN = 4;

  public estimateTokens(text: string): number {
    return Math.ceil(text.length / this.CHARS_PER_TOKEN);
  }

  public estimateBudget(texts: string[]): number {
    return texts.reduce((sum, text) => sum + this.estimateTokens(text), 0);
  }

  public truncateToLimit(text: string, maxTokens: number): string {
    const maxChars = maxTokens * this.CHARS_PER_TOKEN;
    
    if (text.length <= maxChars) {
      return text;
    }

    return text.substring(0, maxChars) + "\n... (truncated)";
  }

  public optimizeBatchSize(
    filesTokenCounts: number[],
    maxTokensPerBatch: number
  ): number[][] {
    const batches: number[][] = [];
    let currentBatch: number[] = [];
    let currentTokens = 0;

    for (let i = 0; i < filesTokenCounts.length; i++) {
      const fileTokens = filesTokenCounts[i];

      if (currentTokens + fileTokens > maxTokensPerBatch && currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch = [];
        currentTokens = 0;
      }

      currentBatch.push(i);
      currentTokens += fileTokens;
    }

    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  }
}