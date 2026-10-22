import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import { Copy, Check, Terminal } from 'lucide-react';
import 'highlight.js/styles/tokyo-night-dark.css'; // More modern tactical theme
import { type Message } from '../hooks/useMarqAI';

interface ChatInterfaceProps {
  messages: Message[];
  isTyping: boolean;
  onRetry?: (text: string) => void;
}

interface CodeBlockProps {
  children?: React.ReactNode;
  className?: string;
}

const CodeBlock = ({ children, className }: CodeBlockProps) => {
  const [copied, setCopied] = useState(false);
  const isInline = !className;

  const handleCopy = () => {
    const text = String(children).replace(/\n$/, '');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isInline) {
    return <code className="inline-code">{children}</code>;
  }

  return (
    <div className="code-block-container">
      <div className="code-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Terminal size={12} />
          <span>{className?.replace('language-', '') || 'code'}</span>
        </div>
        <button onClick={handleCopy} className="copy-btn" aria-label={copied ? 'Code copied' : 'Copy code'}>
          {copied ? <Check size={12} color="#10b981" aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
          <span aria-hidden="true">{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre>
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
};

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages, isTyping, onRetry }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const findPromptFor = (index: number): string | undefined => {
    for (let i = index - 1; i >= 0; i -= 1) {
      if (messages[i].sender === 'user') return messages[i].text;
    }
    return undefined;
  };

  return (
    <div
      ref={scrollRef}
      className="custom-scroll"
      role="log"
      aria-live="polite"
      aria-relevant="additions text"
      style={{
        flex: 1,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        padding: '1rem'
      }}
    >
      <AnimatePresence initial={false}>
        {messages.map((msg, index) => {
          const isError = msg.status === 'error';
          const isCancelled = msg.status === 'cancelled';
          const isWaiting = msg.sender === 'ai' && msg.status === 'streaming' && msg.text.length === 0;
          const prompt = isError ? findPromptFor(index) : undefined;

          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={`chat-bubble ${msg.sender === 'ai' ? 'bubble-ai' : 'bubble-user'}`}
              style={isError ? { borderColor: 'rgba(239, 68, 68, 0.55)' } : undefined}
            >
              {isError ? (
                <div role="alert">
                  <div className="hud-text" style={{ color: 'var(--marq-warn)', fontSize: '0.7rem', marginBottom: '0.4rem' }}>
                    {msg.error?.code ?? 'ERROR'} · REQUEST FAILED
                  </div>
                  <div style={{ color: 'var(--marq-text)', marginBottom: isTyping ? 0 : '0.6rem' }}>
                    {msg.error?.message ?? 'The request failed.'}
                  </div>
                  {msg.error?.retryable && prompt && onRetry && (
                    <button className="neon-btn" onClick={() => onRetry(prompt)} aria-label="Retry the failed message">
                      Retry
                    </button>
                  )}
                </div>
              ) : msg.sender === 'ai' ? (
                <>
                  {isWaiting ? (
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', height: '18px' }} aria-label="Waiting for the first token">
                      <div className="typing-dot" style={{ animationDelay: '0s' }} />
                      <div className="typing-dot" style={{ animationDelay: '0.2s' }} />
                      <div className="typing-dot" style={{ animationDelay: '0.4s' }} />
                    </div>
                  ) : (
                    <ReactMarkdown
                      rehypePlugins={[rehypeHighlight]}
                      components={{
                        code: CodeBlock
                      }}
                    >
                      {msg.text}
                    </ReactMarkdown>
                  )}
                  {isCancelled && (
                    <div className="hud-text" style={{ color: 'var(--marq-text-soft)', fontSize: '0.65rem', marginTop: '0.5rem' }}>
                      STOPPED
                    </div>
                  )}
                </>
              ) : (
                msg.text
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
