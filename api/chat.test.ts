// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from './chat';

interface Recorder {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  jsonPayload?: unknown;
  status(code: number): Recorder;
  setHeader(name: string, value: string): void;
  json(payload: unknown): void;
  write(chunk: string): boolean;
  end(): void;
  flushHeaders(): void;
}

function makeResponse(): Recorder {
  const recorder: Recorder = {
    statusCode: 0,
    headers: {},
    body: '',
    status(code) {
      recorder.statusCode = code;
      return recorder;
    },
    setHeader(name, value) {
      recorder.headers[name] = value;
    },
    json(payload) {
      recorder.jsonPayload = payload;
      recorder.body = JSON.stringify(payload);
    },
    write(chunk) {
      recorder.body += chunk;
      return true;
    },
    end() {},
    flushHeaders() {},
  };
  return recorder;
}

function makeRequest(method: string, body?: unknown) {
  return {
    method,
    body,
    headers: {},
    on: () => undefined,
  };
}

function sseStream(chunks: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

const validBody = { messages: [{ role: 'user', content: 'hello' }] };

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'test-gemini';
  process.env.OPENROUTER_API_KEY = 'test-openrouter';
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

describe('POST /api/chat', () => {
  it('fails over from a broken Gemini attempt to the first streaming OpenRouter model', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('generativelanguage.googleapis.com')) {
        return new Response('high demand', { status: 503 });
      }
      return sseStream([
        'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"!"}}],"usage":{"prompt_tokens":3,"completion_tokens":2}}\n\n',
        'data: [DONE]\n\n',
      ]);
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = makeResponse();
    await handler(makeRequest('POST', validBody), res);

    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toContain('text/event-stream');
    expect(res.body).toContain('event: meta');
    expect(res.body).toContain('"provider":"openrouter"');
    expect(res.body).toContain('event: delta');
    expect(res.body).toContain('"text":"ok"');
    expect(res.body).toContain('"text":"!"');
    expect(res.body).toContain('event: done');
    expect(res.body).toContain('"promptTokens":3');
    expect(res.body).not.toContain('event: error');

    // Gemini first, then OpenRouter — not the other way round.
    expect(String(fetchMock.mock.calls[0][0])).toContain('generativelanguage.googleapis.com');
  });

  it('tries the next Gemini model when the first is saturated', async () => {
    const geminiUrls: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('generativelanguage.googleapis.com')) {
        geminiUrls.push(url);
        if (url.includes('gemini-3.5-flash:')) return new Response('high demand', { status: 503 });
        return sseStream([
          `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] })}\n\n`,
        ]);
      }
      return sseStream(['data: [DONE]\n\n']);
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = makeResponse();
    await handler(makeRequest('POST', validBody), res);

    expect(geminiUrls).toHaveLength(2);
    expect(geminiUrls[0]).toContain('gemini-3.5-flash');
    expect(geminiUrls[1]).toContain('gemini-2.5-flash');
    expect(res.body).toContain('"model":"gemini-2.5-flash"');
    expect(res.body).toContain('"provider":"gemini"');
  });

  it('skips the rest of a provider after a bad key but still fails over', async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('generativelanguage.googleapis.com')) {
        return new Response(
          JSON.stringify({ error: { code: 400, message: 'API key not valid.', status: 'INVALID_ARGUMENT' } }),
          { status: 400 },
        );
      }
      return sseStream([
        'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
        'data: [DONE]\n\n',
      ]);
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = makeResponse();
    await handler(makeRequest('POST', validBody), res);

    const geminiCalls = calls.filter((u) => u.includes('generativelanguage.googleapis.com'));
    expect(geminiCalls).toHaveLength(1);
    expect(res.body).toContain('"provider":"openrouter"');
    expect(res.body).toContain('"text":"ok"');
  });

  it('returns 503 NOT_CONFIGURED when no keys are present', async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    const res = makeResponse();
    await handler(makeRequest('POST', validBody), res);

    expect(res.statusCode).toBe(503);
    expect(res.jsonPayload).toMatchObject({ code: 'NOT_CONFIGURED' });
  });

  it('rejects a body whose last message is not from the user', async () => {
    const res = makeResponse();
    await handler(makeRequest('POST', { messages: [{ role: 'assistant', content: 'hi' }] }), res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonPayload).toMatchObject({ code: 'INVALID_REQUEST' });
  });

  it('emits a terminal error event when every provider fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 429, headers: { 'Retry-After': '30' } })));

    const res = makeResponse();
    await handler(makeRequest('POST', validBody), res);

    expect(res.body).toContain('event: error');
    expect(res.body).toContain('"code":"RATE_LIMITED"');
    expect(res.body).toContain('"retryAfterMs":30000');
  });
});

describe('GET /api/chat', () => {
  it('reports which providers are configured without leaking values', async () => {
    const res = makeResponse();
    await handler(makeRequest('GET'), res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonPayload).toEqual({
      configured: true,
      providers: { gemini: true, openrouter: true },
    });
    expect(res.body).not.toContain('test-gemini');
  });
});
