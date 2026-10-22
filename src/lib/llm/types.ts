export type Provider = 'gemini' | 'openrouter';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatMeta {
  model: string;
  provider: Provider;
}

export interface ChatUsage {
  model?: string;
  provider?: Provider;
  latencyMs?: number;
  firstTokenMs?: number;
  promptTokens?: number;
  completionTokens?: number;
}

export class ChatError extends Error {
  code: string;
  retryable: boolean;

  constructor(message: string, code: string, retryable: boolean) {
    super(message);
    this.name = 'ChatError';
    this.code = code;
    this.retryable = retryable;
  }
}
