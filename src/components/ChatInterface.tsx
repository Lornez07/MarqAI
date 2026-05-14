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
}

const CodeBlock = ({ children, className }: any) => {
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
        <button onClick={handleCopy} className="copy-btn">
          {copied ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre>
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
};

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages, isTyping }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  return (
    <div 
      ref={scrollRef}
      className="custom-scroll"
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
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className={`chat-bubble ${msg.sender === 'ai' ? 'bubble-ai' : 'bubble-user'}`}
          >
            {msg.sender === 'ai' ? (
              <ReactMarkdown 
                rehypePlugins={[rehypeHighlight]}
                components={{
                  code: CodeBlock
                }}
              >
                {msg.text}
              </ReactMarkdown>
            ) : (
              msg.text
            )}
          </motion.div>
        ))}
        {isTyping && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="chat-bubble bubble-ai"
            style={{ width: '60px', display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center' }}
          >
            <div className="typing-dot" style={{ animationDelay: '0s' }} />
            <div className="typing-dot" style={{ animationDelay: '0.2s' }} />
            <div className="typing-dot" style={{ animationDelay: '0.4s' }} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
