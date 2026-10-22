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
  retryAfterMs?: number;

  constructor(message: string, code: string, retryable: boolean, retryAfterMs?: number) {
    super(message);
    this.name = 'ChatError';
    this.code = code;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}

export interface ProviderConfig {
  configured: boolean;
  providers: { gemini: boolean; openrouter: boolean };
}
