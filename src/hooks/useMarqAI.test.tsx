import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMarqAI } from './useMarqAI';
import { SESSIONS_KEY } from '../lib/sessions';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  // The boot probe is irrelevant here; a failed probe must stay optimistic.
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
});

describe('useMarqAI boot', () => {
  it('restores the active session from storage', async () => {
    localStorage.setItem(
      SESSIONS_KEY,
      JSON.stringify({
        version: 1,
        activeId: 's1',
        sessions: [
          {
            id: 's1',
            title: 'Restored session',
            createdAt: 1,
            updatedAt: 2,
            messages: [
              { id: 'g', text: 'online', sender: 'ai', timestamp: 1, status: 'done' },
              { id: 'u', text: 'question', sender: 'user', timestamp: 2, status: 'done' },
            ],
          },
        ],
      }),
    );

    const { result } = renderHook(() => useMarqAI());

    expect(result.current.messages.map((message) => message.text)).toEqual(['online', 'question']);
    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.activeId).toBe('s1');
    await waitFor(() => expect(result.current.providerState).toBe('ready'));
  });

  it('creates a greeting session when storage is empty', () => {
    const { result } = renderHook(() => useMarqAI());

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].text).toContain('MarqAI online');
    expect(result.current.sessions).toHaveLength(1);
  });

  it('reports unconfigured when the proxy has no keys', async () => {
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

    const { result } = renderHook(() => useMarqAI());
    await waitFor(() => expect(result.current.providerState).toBe('unconfigured'));
  });
});
