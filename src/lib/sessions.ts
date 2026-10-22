/**
 * Versioned session store.
 *
 * One key (`marq:v1:sessions`) holds every session plus the active id, so a
 * reload restores both the conversation and the list. Reads are defensive:
 * anything unrecognized is discarded rather than thrown at boot.
 */

export type SessionMessageStatus = 'streaming' | 'done' | 'cancelled' | 'error';

export interface SessionMessage {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: number;
  status?: SessionMessageStatus;
}

export interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: SessionMessage[];
}

export interface SessionState {
  sessions: Session[];
  activeId: string;
}

export const SESSIONS_KEY = 'marq:v1:sessions';
const LEGACY_KEY = 'marq_history';
const VERSION = 1;
export const SESSION_CAP = 20;

const UNTITLED = 'New session';

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isMessage(value: unknown): value is SessionMessage {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<SessionMessage>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.text === 'string' &&
    (entry.sender === 'user' || entry.sender === 'ai') &&
    typeof entry.timestamp === 'number'
  );
}

function isSession(value: unknown): value is Session {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<Session>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.title === 'string' &&
    typeof entry.createdAt === 'number' &&
    typeof entry.updatedAt === 'number' &&
    Array.isArray(entry.messages) &&
    entry.messages.every(isMessage)
  );
}

export function createSession(messages: SessionMessage[] = []): Session {
  const now = Date.now();
  return {
    id: makeId(),
    title: titleFromMessages(messages),
    createdAt: now,
    updatedAt: now,
    messages,
  };
}

/** The first thing the user said is a better label than a timestamp. */
export function titleFromMessages(messages: SessionMessage[]): string {
  const first = messages.find((message) => message.sender === 'user' && message.text.trim());
  if (!first) return UNTITLED;
  const oneLine = first.text.replace(/\s+/g, ' ').trim();
  return oneLine.length > 42 ? `${oneLine.slice(0, 42)}…` : oneLine;
}

/** Insert or replace a session, keeping newest first and bounded. */
export function upsertSession(sessions: Session[], update: Session): Session[] {
  const without = sessions.filter((session) => session.id !== update.id);
  const merged = [update, ...without].sort((a, b) => b.updatedAt - a.updatedAt);
  return merged.slice(0, SESSION_CAP);
}

export function sessionSignature(sessions: Session[]): string {
  return sessions.map((session) => `${session.id}:${session.title}:${session.updatedAt}`).join('|');
}

export function saveSessionState(state: SessionState): void {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify({ version: VERSION, ...state }));
  } catch {
    // Quota or private mode: the session still works in memory.
  }
}

export function loadSessionState(): SessionState {
  const stored = readStored();
  if (stored) return stored;

  const migrated = migrateLegacy();
  if (migrated) {
    saveSessionState(migrated);
    return migrated;
  }

  const fresh = createSession();
  const state = { sessions: [fresh], activeId: fresh.id };
  saveSessionState(state);
  return state;
}

function readStored(): SessionState | null {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { version?: number; sessions?: unknown; activeId?: unknown };
    if (parsed.version !== VERSION || !Array.isArray(parsed.sessions)) throw new Error('unrecognized shape');

    const sessions = parsed.sessions.filter(isSession).slice(0, SESSION_CAP);
    if (sessions.length === 0) throw new Error('no valid sessions');

    const activeId =
      typeof parsed.activeId === 'string' && sessions.some((session) => session.id === parsed.activeId)
        ? parsed.activeId
        : sessions[0].id;

    return { sessions, activeId };
  } catch {
    try {
      localStorage.removeItem(SESSIONS_KEY);
    } catch {
      // ignore
    }
    return null;
  }
}

/** `marq_history` held a bare message array in sessionStorage. */
function migrateLegacy(): SessionState | null {
  try {
    const raw = sessionStorage.getItem(LEGACY_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;

    const messages = parsed.filter(isMessage);
    if (messages.length === 0) return null;

    const session: Session = {
      ...createSession(messages),
      updatedAt: Date.now(),
    };
    sessionStorage.removeItem(LEGACY_KEY);
    return { sessions: [session], activeId: session.id };
  } catch {
    try {
      sessionStorage.removeItem(LEGACY_KEY);
    } catch {
      // ignore
    }
    return null;
  }
}
