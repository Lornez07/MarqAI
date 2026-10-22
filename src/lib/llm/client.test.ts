import { describe, expect, it, vi, afterEach } from 'vitest';
import { fetchProviderConfig, streamChat } from './client';
import { ChatError } from './types';

function sseResponse(chunks: string[], init?: ResponseInit): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' }, ...init });
}

const prompt = [{ role: 'user' as const, content: 'hello' }];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('streamChat', () => {
  it('decodes meta, split deltas, and usage across frame boundaries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse([
          'event: meta\ndata: {"model":"gemini-flash-latest","provider":"gemini"}\n\n',
          'event: delta\ndata: {"te',
          'xt":"Hel"}\n\n',
          'event: delta\ndata: {"text":"lo"}\n\n',
          'event: done\ndata: {"latencyMs":12,"firstTokenMs":5}\n\n',
        ]),
      ),
    );

    const deltas: string[] = [];
    const meta: string[] = [];
    const usage = await streamChat(prompt, {
      signal: new AbortController().signal,
      onMeta: (m) => meta.push(`${m.provider}/${m.model}`),
      onDelta: (d) => deltas.push(d),
    });

    expect(meta).toEqual(['gemini/gemini-flash-latest']);
    expect(deltas).toEqual(['Hel', 'lo']);
    expect(usage.latencyMs).toBe(12);
    expect(usage.firstTokenMs).toBe(5);
  });

  it('turns an SSE error frame into a retryable ChatError with the cooldown', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse([
          'event: error\ndata: {"message":"OpenRouter request failed (429).","code":"RATE_LIMITED","retryable":true,"retryAfterMs":5000}\n\n',
        ]),
      ),
    );

    const failure = await streamChat(prompt, { signal: new AbortController().signal, onDelta: () => {} }).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ChatError);
    expect(failure).toMatchObject({ code: 'RATE_LIMITED', retryable: true, retryAfterMs: 5000 });
  });

  it('maps an HTTP 503 JSON body to NOT_CONFIGURED', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'No provider keys are configured on the server.', code: 'NOT_CONFIGURED' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );

    const failure = await streamChat(prompt, { signal: new AbortController().signal, onDelta: () => {} }).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ChatError);
    expect(failure).toMatchObject({ code: 'NOT_CONFIGURED', retryable: false });
  });

  it('propagates AbortError when the caller cancels before headers arrive', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
          }),
      ),
    );

    const controller = new AbortController();
    const pending = streamChat(prompt, { signal: controller.signal, onDelta: () => {} });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('fetchProviderConfig', () => {
  it('reports presence without exposing values', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ configured: false, providers: { gemini: false, openrouter: false } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );

    await expect(fetchProviderConfig()).resolves.toEqual({
      configured: false,
      providers: { gemini: false, openrouter: false },
    });
  });

  it('returns null when the probe fails, so the UI stays optimistic', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    await expect(fetchProviderConfig()).resolves.toBeNull();
  });
});
