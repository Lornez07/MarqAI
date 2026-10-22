import { useState, useCallback, useEffect, useRef } from 'react';
import { streamChat, fetchProviderConfig } from '../lib/llm/client';
import { ChatError, type ChatMessage, type Provider } from '../lib/llm/types';
import {
  createSession,
  loadSessionState,
  saveSessionState,
  sessionSignature,
  titleFromMessages,
  upsertSession,
  SESSION_CAP,
  type Session,
  type SessionMessage,
  type SessionState,
} from '../lib/sessions';

export interface Message extends SessionMessage {
  error?: { message: string; code: string; retryable: boolean; retryAfterMs?: number };
  meta?: { model?: string; provider?: Provider; latencyMs?: number; firstTokenMs?: number };
}

export interface SystemStatus {
  model: string;
  link: 'Stable' | 'Restricted';
  requests: number;
  lastLatencyMs: number | null;
}

export type ProviderState = 'checking' | 'ready' | 'unconfigured';

const GREETING_TEXT = 'MarqAI online. Ask about architecture, logic, or whatever is blocking you.';

function makeGreeting(): Message {
  return {
    id: 'greeting',
    sender: 'ai',
    text: GREETING_TEXT,
    timestamp: Date.now(),
    status: 'done',
  };
}

function toMessage(message: SessionMessage): Message {
  return { ...message };
}

function withGreeting(messages: SessionMessage[]): Message[] {
  return messages.length > 0 ? messages.map(toMessage) : [makeGreeting()];
}

/** Strip transient fields; a half-streamed reply survives as `cancelled`. */
function toStored(message: Message): SessionMessage {
  return {
    id: message.id,
    text: message.text,
    sender: message.sender,
    timestamp: message.timestamp,
    status: message.status === 'streaming' ? 'cancelled' : message.status,
  };
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function bootState(): SessionState {
  const state = loadSessionState();
  const active = state.sessions.find((session) => session.id === state.activeId) ?? state.sessions[0];
  return { sessions: state.sessions, activeId: active.id };
}

export function useMarqAI() {
  const bootRef = useRef<SessionState | null>(null);
  if (!bootRef.current) bootRef.current = bootState();
  const boot = bootRef.current;

  const [sessions, setSessions] = useState<Session[]>(boot.sessions);
  const [activeId, setActiveId] = useState<string>(boot.activeId);
  const [messages, setMessages] = useState<Message[]>(() =>
    withGreeting(boot.sessions.find((session) => session.id === boot.activeId)?.messages ?? []),
  );

  const [isTyping, setIsTyping] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isSelfDestructing, setIsSelfDestructing] = useState(false);
  const [providerState, setProviderState] = useState<ProviderState>('checking');
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    model: 'Not connected',
    link: 'Stable',
    requests: 0,
    lastLatencyMs: null,
  });

  const messagesRef = useRef<Message[]>(messages);
  const sessionsRef = useRef<Session[]>(boot.sessions);
  const signatureRef = useRef(sessionSignature(boot.sessions));
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Write-through persistence: every change lands in one versioned key, but the
  // session list only re-renders when ids, titles, or order change.
  useEffect(() => {
    const stored = messages.filter((message) => message.status !== 'error').map(toStored);
    const existing = sessionsRef.current.find((session) => session.id === activeId);
    const next = upsertSession(sessionsRef.current, {
      id: activeId,
      title: titleFromMessages(stored),
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      messages: stored,
    });

    sessionsRef.current = next;
    saveSessionState({ sessions: next, activeId });

    const signature = sessionSignature(next);
    if (signature !== signatureRef.current) {
      signatureRef.current = signature;
      setSessions(next);
    }
  }, [messages, activeId]);

  const checkConfig = useCallback(async (signal?: AbortSignal) => {
    const config = await fetchProviderConfig(signal);
    if (signal?.aborted) return;
    setProviderState(config ? (config.configured ? 'ready' : 'unconfigured') : 'ready');
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void checkConfig(controller.signal);
    return () => controller.abort();
  }, [checkConfig]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || abortRef.current || providerState === 'unconfigured') return;

      const userMsg: Message = {
        id: newId(),
        text: content,
        sender: 'user',
        timestamp: Date.now(),
        status: 'done',
      };

      const replyId = newId();
      const reply: Message = {
        id: replyId,
        text: '',
        sender: 'ai',
        timestamp: Date.now(),
        status: 'streaming',
      };

      const history: ChatMessage[] = [
        ...messagesRef.current
          .filter((m) => m.status !== 'error' && m.id !== 'greeting')
          .map((m) => ({ role: m.sender === 'user' ? ('user' as const) : ('assistant' as const), content: m.text })),
        { role: 'user', content },
      ];

      setMessages((prev) => [...prev, userMsg, reply]);
      setIsTyping(true);
      setIsSearching(true);

      const controller = new AbortController();
      abortRef.current = controller;

      const patchReply = (update: Partial<Message>) => {
        setMessages((prev) => prev.map((m) => (m.id === replyId ? { ...m, ...update } : m)));
      };

      try {
        const usage = await streamChat(history, {
          signal: controller.signal,
          onMeta: (meta) => {
            setSystemStatus((prev) => ({ ...prev, model: meta.model }));
            patchReply({ meta: { model: meta.model, provider: meta.provider } });
          },
          onDelta: (delta) => {
            setMessages((prev) =>
              prev.map((m) => (m.id === replyId ? { ...m, text: m.text + delta } : m)),
            );
          },
        });

        setMessages((prev) =>
          prev.map((m) =>
            m.id === replyId
              ? {
                  ...m,
                  status: m.text ? 'done' : 'error',
                  meta: { ...m.meta, latencyMs: usage.latencyMs, firstTokenMs: usage.firstTokenMs },
                  error: m.text
                    ? undefined
                    : { message: 'The model returned an empty response.', code: 'EMPTY_RESPONSE', retryable: true },
                }
              : m,
          ),
        );

        if (usage.latencyMs !== undefined) {
          setSystemStatus((prev) => ({
            ...prev,
            link: 'Stable',
            requests: prev.requests + 1,
            lastLatencyMs: usage.latencyMs ?? null,
          }));
        }
      } catch (error) {
        if (controller.signal.aborted) {
          setMessages((prev) =>
            prev.map((m) => (m.id === replyId ? { ...m, status: 'cancelled', error: undefined } : m)),
          );
        } else {
          const failure =
            error instanceof ChatError
              ? error
              : new ChatError('Could not reach the server.', 'NETWORK', true);

          setMessages((prev) =>
            prev.map((m) =>
              m.id === replyId
                ? {
                    ...m,
                    status: 'error',
                    text: '',
                    error: {
                      message: failure.message,
                      code: failure.code,
                      retryable: failure.retryable,
                      retryAfterMs: failure.retryAfterMs,
                    },
                  }
                : m,
            ),
          );
          setSystemStatus((prev) => ({ ...prev, link: 'Restricted' }));
        }
      } finally {
        abortRef.current = null;
        setIsTyping(false);
        setIsSearching(false);
      }
    },
    [providerState],
  );

  const clearChat = useCallback(() => {
    abortRef.current?.abort();
    setMessages([makeGreeting()]);
    setSystemStatus((prev) => ({ ...prev, link: 'Stable', requests: 0, lastLatencyMs: null }));
  }, []);

  const newSession = useCallback(() => {
    abortRef.current?.abort();
    const session = createSession([makeGreeting()]);
    const next = [session, ...sessionsRef.current].slice(0, SESSION_CAP);

    sessionsRef.current = next;
    signatureRef.current = sessionSignature(next);
    saveSessionState({ sessions: next, activeId: session.id });

    setSessions(next);
    setActiveId(session.id);
    setMessages(session.messages.map(toMessage));
  }, []);

  const selectSession = useCallback(
    (id: string) => {
      if (id === activeId) return;
      const target = sessionsRef.current.find((session) => session.id === id);
      if (!target) return;

      abortRef.current?.abort();
      setActiveId(id);
      setMessages(withGreeting(target.messages));
    },
    [activeId],
  );

  const triggerSelfDestruct = useCallback(() => {
    abortRef.current?.abort();
    setIsSelfDestructing(true);
    clearChat();
    setTimeout(() => setIsSelfDestructing(false), 1200);
  }, [clearChat]);

  return {
    messages,
    sendMessage,
    isTyping,
    isSearching,
    clearChat,
    triggerSelfDestruct,
    isSelfDestructing,
    systemStatus,
    stopGeneration,
    sessions,
    activeId,
    newSession,
    selectSession,
    providerState,
    recheckConfig: checkConfig,
  };
}
