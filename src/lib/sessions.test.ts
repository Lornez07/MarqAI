import { beforeEach, describe, expect, it } from 'vitest';
import {
  SESSIONS_KEY,
  SESSION_CAP,
  createSession,
  loadSessionState,
  saveSessionState,
  titleFromMessages,
  upsertSession,
  type SessionMessage,
} from './sessions';

const userMessage = (text: string, timestamp = Date.now()): SessionMessage => ({
  id: `id-${text}`,
  text,
  sender: 'user',
  timestamp,
  status: 'done',
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('loadSessionState', () => {
  it('boots a fresh session and persists it', () => {
    const state = loadSessionState();

    expect(state.sessions).toHaveLength(1);
    expect(state.activeId).toBe(state.sessions[0].id);
    expect(localStorage.getItem(SESSIONS_KEY)).toContain('"version":1');
  });

  it('restores the stored sessions and active id', () => {
    const first = createSession([userMessage('first')]);
    const second = createSession([userMessage('second')]);
    saveSessionState({ sessions: [second, first], activeId: first.id });

    const state = loadSessionState();
    expect(state.activeId).toBe(first.id);
    expect(state.sessions.map((session) => session.title)).toEqual(['second', 'first']);
  });

  it('discards corrupt JSON instead of throwing', () => {
    localStorage.setItem(SESSIONS_KEY, '{not json');

    const state = loadSessionState();
    expect(state.sessions).toHaveLength(1);
    expect(() => JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? '')).not.toThrow();
  });

  it('discards an unknown schema version', () => {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify({ version: 99, sessions: [{ id: 'x' }], activeId: 'x' }));

    const state = loadSessionState();
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0].id).not.toBe('x');
  });

  it('migrates the legacy marq_history array and clears it', () => {
    sessionStorage.setItem('marq_history', JSON.stringify([userMessage('legacy question')]));

    const state = loadSessionState();
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0].title).toBe('legacy question');
    expect(state.sessions[0].messages).toHaveLength(1);
    expect(sessionStorage.getItem('marq_history')).toBeNull();
  });
});

describe('upsertSession', () => {
  it('keeps newest first and caps the list', () => {
    let sessions: ReturnType<typeof createSession>[] = [];
    for (let i = 0; i < SESSION_CAP + 5; i += 1) {
      const session = createSession([userMessage(`session ${i}`)]);
      sessions = upsertSession(sessions, { ...session, updatedAt: 1000 + i });
    }

    expect(sessions).toHaveLength(SESSION_CAP);
    expect(sessions[0].title).toBe(`session ${SESSION_CAP + 4}`);
    expect(sessions.some((session) => session.title === 'session 0')).toBe(false);
  });

  it('replaces an existing session without duplicating it', () => {
    const session = createSession([userMessage('keep me')]);
    const once = upsertSession([], session);
    const twice = upsertSession(once, { ...session, updatedAt: session.updatedAt + 1 });

    expect(twice).toHaveLength(1);
  });
});

describe('titleFromMessages', () => {
  it('labels a session with the first user message, flattened and clamped', () => {
    const title = titleFromMessages([
      { id: 'g', text: 'MarqAI online.', sender: 'ai', timestamp: 1 },
      userMessage(`  line one\nline two ${'x'.repeat(60)}`),
    ]);

    expect(title.startsWith('line one line two')).toBe(true);
    expect(title.endsWith('…')).toBe(true);
    expect(title.length).toBeLessThanOrEqual(43);
  });

  it('falls back when the user has not spoken yet', () => {
    expect(titleFromMessages([])).toBe('New session');
  });
});
