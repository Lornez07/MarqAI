import { ChatError, type ChatMessage, type ChatMeta, type ChatUsage } from './types';

export interface StreamHandlers {
  onMeta?: (meta: ChatMeta) => void;
  onDelta: (text: string) => void;
  onDone?: (usage: ChatUsage) => void;
}

/**
 * Single seam between the UI and the server proxy.
 *
 * Owns: the fetch, SSE frame decoding, and error normalization.
 * Does not own: message state, retries, or persistence.
 *
 * Throws `ChatError` for anything the server or network reports, and lets a
 * user-initiated `AbortError` propagate so callers can mark the turn cancelled.
 */
export async function streamChat(
  messages: ChatMessage[],
  options: { signal: AbortSignal } & StreamHandlers,
): Promise<ChatUsage> {
  const { signal, onMeta, onDelta, onDone } = options;

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal,
  });

  if (!response.ok) {
    const payload = await readErrorPayload(response);
    throw new ChatError(payload.message, payload.code, payload.retryable);
  }

  if (!response.body) {
    throw new ChatError('The server returned no stream.', 'EMPTY_STREAM', true);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let usage: ChatUsage = {};

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        const dispatch = parseFrame(frame);
        if (!dispatch) continue;

        if (dispatch.event === 'meta') {
          const meta = dispatch.data as ChatMeta;
          usage = { ...usage, model: meta.model, provider: meta.provider };
          onMeta?.(meta);
        } else if (dispatch.event === 'delta') {
          const text = (dispatch.data as { text?: string }).text;
          if (text) onDelta(text);
        } else if (dispatch.event === 'done') {
          usage = { ...usage, ...(dispatch.data as ChatUsage) };
          onDone?.(usage);
        } else if (dispatch.event === 'error') {
          const failure = dispatch.data as { message?: string; code?: string; retryable?: boolean };
          throw new ChatError(
            failure.message ?? 'The request failed.',
            failure.code ?? 'UPSTREAM_ERROR',
            failure.retryable ?? true,
          );
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return usage;
}

function parseFrame(frame: string): { event: string; data: unknown } | null {
  let event = 'message';
  const dataLines: string[] = [];

  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
  }

  if (dataLines.length === 0) return null;

  const raw = dataLines.join('\n');
  try {
    return { event, data: JSON.parse(raw) };
  } catch {
    return null;
  }
}

async function readErrorPayload(response: Response): Promise<{ message: string; code: string; retryable: boolean }> {
  try {
    const body = (await response.json()) as { error?: string; code?: string };
    return {
      message: body.error ?? `Request failed (${response.status}).`,
      code: body.code ?? `HTTP_${response.status}`,
      retryable: response.status >= 500 || response.status === 429,
    };
  } catch {
    return {
      message: `Request failed (${response.status}).`,
      code: `HTTP_${response.status}`,
      retryable: response.status >= 500,
    };
  }
}
