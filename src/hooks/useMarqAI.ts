import { useState, useCallback, useEffect, useRef } from 'react';
import { streamChat } from '../lib/llm/client';
import { ChatError, type ChatMessage, type Provider } from '../lib/llm/types';

export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: number;
  status?: 'streaming' | 'done' | 'cancelled' | 'error';
  error?: { message: string; code: string; retryable: boolean };
  meta?: { model?: string; provider?: Provider; latencyMs?: number; firstTokenMs?: number };
}

export interface SystemStatus {
  model: string;
  link: 'Stable' | 'Restricted';
  requests: number;
  lastLatencyMs: number | null;
}

const STORAGE_KEY = 'marq_history';

const GREETING: Message = {
  id: 'greeting',
  sender: 'ai',
  text: 'MarqAI online. Ask about architecture, logic, or whatever is blocking you.',
  timestamp: Date.now(),
  status: 'done',
};

function loadHistory(): Message[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [GREETING];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [GREETING];

    const valid = parsed.filter(
      (entry): entry is Message =>
        !!entry &&
        typeof entry === 'object' &&
        typeof (entry as Message).id === 'string' &&
        typeof (entry as Message).text === 'string' &&
        ((entry as Message).sender === 'user' || (entry as Message).sender === 'ai'),
    );

    return valid.length > 0 ? valid : [GREETING];
  } catch {
    // Corrupt state must never block boot.
    sessionStorage.removeItem(STORAGE_KEY);
    return [GREETING];
  }
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function useMarqAI() {
  const [messages, setMessages] = useState<Message[]>(loadHistory);
  const [isTyping, setIsTyping] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isSelfDestructing, setIsSelfDestructing] = useState(false);
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    model: 'Not connected',
    link: 'Stable',
    requests: 0,
    lastLatencyMs: null,
  });

  const messagesRef = useRef<Message[]>(messages);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // Storage full or unavailable: the session still works in memory.
    }
  }, [messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || abortRef.current) return;

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
            prev.map((m) =>
              m.id === replyId
                ? {
                    ...m,
                    status: 'cancelled',
                    error: undefined,
                    text: m.text,
                    meta: { ...m.meta },
                  }
                : m,
            ),
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
                    error: { message: failure.message, code: failure.code, retryable: failure.retryable },
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
    [],
  );

  const clearChat = useCallback(() => {
    abortRef.current?.abort();
    setMessages([{ ...GREETING, timestamp: Date.now() }]);
    setSystemStatus((prev) => ({ ...prev, link: 'Stable', requests: 0, lastLatencyMs: null }));
    sessionStorage.removeItem(STORAGE_KEY);
  }, []);

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
  };
}
