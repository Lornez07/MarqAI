/**
 * POST /api/chat — server-side LLM proxy with streaming.
 *
 * Why this exists: the browser must never hold a provider key. Everything in
 * this file runs server-side only; keys are read from `process.env` and are
 * never serialized into a response body, a header, or a log line.
 *
 * Response contract (text/event-stream):
 *   event: meta   data: { model, provider }
 *   event: delta  data: { text }
 *   event: done   data: { latencyMs, firstTokenMs, promptTokens, completionTokens }
 *   event: error  data: { message, code, retryable }
 *
 * Exactly one terminal `done` or `error` event is sent.
 */

const GEMINI_MODEL = 'gemini-flash-latest';

/** Ordered fallbacks. Free-tier catalogs rotate; keep this list short and current. */
const OPENROUTER_MODELS = [
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
];

const SYSTEM_PROMPT = `
You are MarqAI, a knowledgeable peer helping with architecture, logic, and general inquiries.
Tone: conversational, clear, specific. Avoid subservient language such as "Sir" or "Admin".
Do not roleplay as a spacecraft computer. The interface supplies the atmosphere; you supply the answers.
`;

const MAX_MESSAGES = 30;
const MAX_MESSAGE_CHARS = 8000;
const HISTORY_TURNS = 10;
const CONNECT_TIMEOUT_MS = 5000;
const TOTAL_BUDGET_MS = 45000;

type Role = 'user' | 'assistant';
type Provider = 'gemini' | 'openrouter';

interface ChatMessage {
  role: Role;
  content: string;
}

interface Usage {
  promptTokens?: number;
  completionTokens?: number;
}

class ProviderError extends Error {
  code: string;
  retryable: boolean;
  retryAfterMs?: number;

  constructor(code: string, message: string, retryable: boolean, retryAfterMs?: number) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}

/** Structural types so the function typechecks without adding @vercel/node. */
interface ProxyRequest {
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
  on(event: 'close', listener: () => void): unknown;
}

interface ProxyResponse {
  status(code: number): ProxyResponse;
  setHeader(name: string, value: string): void;
  json(payload: unknown): void;
  write(chunk: string): boolean;
  end(): void;
  flushHeaders?(): void;
}

interface GeminiChunk {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

interface OpenRouterChunk {
  choices?: Array<{ delta?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/* ------------------------------------------------------------------ *
 * Request parsing
 * ------------------------------------------------------------------ */

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function parseMessages(body: unknown): ChatMessage[] | { error: string } {
  const parsed = typeof body === 'string' ? safeJson(body) : body;

  if (!parsed || typeof parsed !== 'object') return { error: 'Body must be a JSON object.' };

  const raw = (parsed as { messages?: unknown }).messages;
  if (!Array.isArray(raw) || raw.length === 0) return { error: '`messages` must be a non-empty array.' };
  if (raw.length > MAX_MESSAGES) return { error: `\`messages\` exceeds ${MAX_MESSAGES} entries.` };

  const messages: ChatMessage[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') return { error: 'Each message must be an object.' };
    const { role, content } = entry as { role?: unknown; content?: unknown };
    if (role !== 'user' && role !== 'assistant') return { error: 'Each message role must be "user" or "assistant".' };
    if (typeof content !== 'string' || content.trim().length === 0) return { error: 'Each message needs non-empty content.' };
    if (content.length > MAX_MESSAGE_CHARS) return { error: `A message exceeds ${MAX_MESSAGE_CHARS} characters.` };
    messages.push({ role, content });
  }

  if (messages[messages.length - 1].role !== 'user') return { error: 'The last message must be from the user.' };

  return messages.slice(-HISTORY_TURNS * 2);
}

function originAllowed(headers: ProxyRequest['headers']): boolean {
  const origin = Array.isArray(headers.origin) ? headers.origin[0] : headers.origin;
  const host = Array.isArray(headers.host) ? headers.host[0] : headers.host;

  if (!origin || !host) return true; // curl, server-to-server, same-origin without Origin

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * SSE plumbing
 * ------------------------------------------------------------------ */

function send(res: ProxyResponse, event: string, data: unknown): boolean {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch {
    return false; // client disconnected
  }
}

function openStream(res: ProxyResponse, budgetSignal: AbortSignal): boolean {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  return !budgetSignal.aborted;
}

/** Reads upstream SSE frames and hands each `data:` payload to `onData`. */
async function consumeSse(response: Response, onData: (payload: string) => void): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new ProviderError('UPSTREAM_EMPTY', 'Provider returned no stream body.', true);

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        const data = frame
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim())
          .join('\n');
        if (data) onData(data);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/* ------------------------------------------------------------------ *
 * Provider transports
 * ------------------------------------------------------------------ */

/** `Retry-After` is seconds or an HTTP date; normalize to milliseconds. */
function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000) || undefined;
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  const delta = date - Date.now();
  return delta > 0 ? delta : undefined;
}

async function upstreamError(provider: string, response: Response): Promise<ProviderError> {
  const status = response.status;

  let detail = '';
  try {
    detail = (await response.text()).slice(0, 300);
  } catch {
    // body already consumed or unreadable
  }

  // Server-side only. Never forwarded to the client.
  console.error(`[chat] ${provider} ${status}: ${detail}`);

  const code =
    status === 429
      ? 'RATE_LIMITED'
      : status === 401 || status === 403
        ? 'AUTH_INVALID'
        : status >= 500
          ? 'UPSTREAM_ERROR'
          : 'UPSTREAM_REJECTED';

  const retryable = code === 'RATE_LIMITED' || code === 'UPSTREAM_ERROR';
  const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
  const label = provider === 'gemini' ? 'Gemini' : 'OpenRouter';
  return new ProviderError(code, `${label} request failed (${status}).`, retryable, retryAfterMs);
}

async function startAttempt(url: string, init: RequestInit, budget: AbortSignal) {
  const controller = new AbortController();
  const linkBudget = () => controller.abort(new Error('REQUEST_ABORTED'));
  budget.addEventListener('abort', linkBudget, { once: true });

  const connectTimer = setTimeout(() => controller.abort(new Error('CONNECT_TIMEOUT')), CONNECT_TIMEOUT_MS);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(connectTimer);
    return {
      response,
      release: () => budget.removeEventListener('abort', linkBudget),
    };
  } catch (error) {
    clearTimeout(connectTimer);
    budget.removeEventListener('abort', linkBudget);

    if (budget.aborted) throw new ProviderError('ABORTED', 'Request cancelled.', false);

    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('CONNECT_TIMEOUT')) {
      throw new ProviderError('CONNECT_TIMEOUT', 'Provider did not respond in time.', true);
    }
    throw new ProviderError('NETWORK', 'Could not reach provider.', true);
  }
}

async function runGemini(
  key: string,
  messages: ChatMessage[],
  budget: AbortSignal,
  onMeta: () => void,
  onDelta: (text: string) => void,
): Promise<Usage> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`;

  const { response, release } = await startAttempt(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
      }),
    },
    budget,
  );

  if (!response.ok) {
    release();
    throw await upstreamError('gemini', response);
  }

  onMeta();
  const usage: Usage = {};

  try {
    await consumeSse(response, (payload) => {
      if (payload === '[DONE]') return;
      let chunk: GeminiChunk;
      try {
        chunk = JSON.parse(payload) as GeminiChunk;
      } catch {
        return; // ignore keep-alive or malformed frames
      }
      const text = chunk.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      if (text) onDelta(text);
      if (chunk.usageMetadata) {
        usage.promptTokens = chunk.usageMetadata.promptTokenCount;
        usage.completionTokens = chunk.usageMetadata.candidatesTokenCount;
      }
    });
  } finally {
    release();
  }

  return usage;
}

async function runOpenRouter(
  key: string,
  model: string,
  messages: ChatMessage[],
  budget: AbortSignal,
  onMeta: () => void,
  onDelta: (text: string) => void,
): Promise<Usage> {
  const { response, release } = await startAttempt(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://marqai.vercel.app',
        'X-Title': 'MarqAI',
      },
      body: JSON.stringify({
        model,
        stream: true,
        stream_options: { include_usage: true },
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      }),
    },
    budget,
  );

  if (!response.ok) {
    release();
    throw await upstreamError('openrouter', response);
  }

  onMeta();
  const usage: Usage = {};

  try {
    await consumeSse(response, (payload) => {
      if (payload === '[DONE]') return;
      let chunk: OpenRouterChunk;
      try {
        chunk = JSON.parse(payload) as OpenRouterChunk;
      } catch {
        return;
      }
      const text = chunk.choices?.[0]?.delta?.content;
      if (text) onDelta(text);
      if (chunk.usage) {
        usage.promptTokens = chunk.usage.prompt_tokens;
        usage.completionTokens = chunk.usage.completion_tokens;
      }
    });
  } finally {
    release();
  }

  return usage;
}

/* ------------------------------------------------------------------ *
 * Handler
 * ------------------------------------------------------------------ */

export default async function handler(req: ProxyRequest, res: ProxyResponse): Promise<void> {
  if (req.method === 'GET') {
    // Pre-flight: lets the UI block before the first message instead of failing
    // after it. Presence only — never the values.
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      configured: Boolean(process.env.GEMINI_API_KEY?.trim() || process.env.OPENROUTER_API_KEY?.trim()),
      providers: {
        gemini: Boolean(process.env.GEMINI_API_KEY?.trim()),
        openrouter: Boolean(process.env.OPENROUTER_API_KEY?.trim()),
      },
    });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST.', code: 'METHOD_NOT_ALLOWED' });
    return;
  }

  if (!originAllowed(req.headers)) {
    res.status(403).json({ error: 'Cross-origin requests are not allowed.', code: 'ORIGIN_REJECTED' });
    return;
  }

  const messages = parseMessages(req.body);
  if ('error' in messages) {
    res.status(400).json({ error: messages.error, code: 'INVALID_REQUEST' });
    return;
  }

  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();

  if (!geminiKey && !openRouterKey) {
    res.status(503).json({
      error: 'No provider keys are configured on the server.',
      code: 'NOT_CONFIGURED',
    });
    return;
  }

  const budget = new AbortController();
  const budgetTimer = setTimeout(() => budget.abort(new Error('TOTAL_BUDGET_EXCEEDED')), TOTAL_BUDGET_MS);
  req.on('close', () => budget.abort(new Error('CLIENT_CLOSED')));

  if (!openStream(res, budget.signal)) {
    clearTimeout(budgetTimer);
    return;
  }

  const startedAt = Date.now();
  let firstTokenAt: number | undefined;
  let emitted = 0;
  let current: { model: string; provider: Provider } = { model: GEMINI_MODEL, provider: 'gemini' };

  const onDelta = (text: string) => {
    if (!firstTokenAt) firstTokenAt = Date.now();
    emitted += text.length;
    send(res, 'delta', { text });
  };

  const attempts: Array<{ provider: Provider; model: string; run: () => Promise<Usage> }> = [];

  if (geminiKey) {
    attempts.push({
      provider: 'gemini',
      model: GEMINI_MODEL,
      run: () =>
        runGemini(geminiKey, messages, budget.signal, () => {
          current = { model: GEMINI_MODEL, provider: 'gemini' };
          send(res, 'meta', current);
        }, onDelta),
    });
  }

  if (openRouterKey) {
    for (const model of OPENROUTER_MODELS) {
      attempts.push({
        provider: 'openrouter',
        model,
        run: () =>
          runOpenRouter(openRouterKey, model, messages, budget.signal, () => {
            current = { model, provider: 'openrouter' };
            send(res, 'meta', current);
          }, onDelta),
      });
    }
  }

  let lastError: ProviderError | undefined;

  try {
    for (const attempt of attempts) {
      if (budget.signal.aborted) break;

      try {
        const usage = await attempt.run();
        send(res, 'done', {
          model: current.model,
          provider: current.provider,
          latencyMs: Date.now() - startedAt,
          firstTokenMs: firstTokenAt ? firstTokenAt - startedAt : undefined,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
        });
        return;
      } catch (error) {
        const normalized =
          error instanceof ProviderError
            ? error
            : new ProviderError('UNKNOWN', error instanceof Error ? error.message : 'Provider failed.', true);

        lastError = normalized;
        console.error(`[chat] attempt failed (${attempt.provider}/${attempt.model}): ${normalized.code}`);

        // Never fail over after text has reached the client: the user would see
        // two answers stitched together.
        if (emitted > 0 || normalized.code === 'ABORTED') break;

        // Auth problems are per-provider: fall through to the next provider,
        // but do not burn the remaining models on the same bad key.
        if (normalized.code === 'AUTH_INVALID') break;
      }
    }

    if (budget.signal.aborted && emitted === 0) return; // client went away

    send(res, 'error', {
      message: lastError?.message ?? 'All providers failed.',
      code: lastError?.code ?? 'NO_PROVIDER',
      retryable: lastError?.retryable ?? true,
      retryAfterMs: lastError?.retryAfterMs,
    });
  } finally {
    clearTimeout(budgetTimer);
    res.end();
  }
}
