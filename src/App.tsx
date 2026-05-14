import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Shield, Activity, Maximize2 } from 'lucide-react';
import './index.css';
import { useMarqAI } from './hooks/useMarqAI';
import { useHolographicAudio } from './hooks/useHolographicAudio';
import { MarqAvatar } from './components/MarqAvatar';
import { ChatInterface } from './components/ChatInterface';
import { MarqHUD } from './components/MarqHUD';
import { SystemData } from './components/SystemData';
import { HolographicFace } from './components/HolographicFace';

function App() {
  const { 
    messages,
    sendMessage,
    isTyping, 
    isSearching,
    clearChat, 
    triggerSelfDestruct, 
    isSelfDestructing, 
    systemStatus 
  } = useMarqAI();
  const { playChirp } = useHolographicAudio();
  const [inputText, setInputText] = useState('');
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    // Play sound when AI finishes typing
    if (!isTyping && messages.length > 1 && messages[messages.length-1].sender === 'ai') {
      playChirp();
    }
  }, [isTyping, messages, playChirp]);

  useEffect(() => {
    const timer = setTimeout(() => setIsInitializing(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    playChirp();
    sendMessage(inputText);
    setInputText('');
  };

  if (isInitializing) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="hud-text"
          style={{ color: 'var(--marq-accent)', fontSize: '1.5rem', textAlign: 'center' }}
        >
          <motion.div
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ repeat: Infinity, duration: 1 }}
          >
            MARQ-CORE INITIALIZATION...
          </motion.div>
          <div style={{ width: '300px', height: '2px', background: 'rgba(34, 211, 238, 0.1)', marginTop: '1rem', overflow: 'hidden' }}>
            <motion.div 
              style={{ height: '100%', background: 'var(--marq-accent)' }}
              animate={{ x: [-300, 300] }}
              transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
            />
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
      <div className="scanner-overlay" />
      <div className="data-stream-layer" />
      
      {/* Background HUD Layers */}
      <div style={{ position: 'absolute', top: '30%', left: '20%', transform: 'translate(-50%, -50%)' }}>
        <MarqHUD />
      </div>


      <div className="app-container">
        
        {/* Header - Stays at top */}
        <header className="app-header">
          <div className="header-left">
            <div className="hud-panel" style={{ padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <MarqAvatar />
              <div>
                <h1 className="glitch-text" style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '2px', color: 'var(--marq-accent)' }}>
                  MarqAI<span style={{ opacity: 0.5 }}>.Companion</span>
                </h1>
                <div className="hud-text" style={{ color: 'var(--marq-accent)', opacity: 0.6, display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem' }}>
                  <Shield size={10} /> SECURE COMPANION LINK
                </div>
              </div>
            </div>

            <div className="hud-panel" style={{ padding: '0.75rem', display: 'flex', gap: '1rem' }}>
              <div style={{ opacity: 0.5 }}>
                <div className="hud-text" style={{ fontSize: '0.7rem' }}>Uptime</div>
                <div className="hud-text" style={{ color: 'white', fontSize: '0.9rem' }}>04:12:12</div>
              </div>
              <div style={{ width: '1px', background: 'var(--glass-border)' }} />
              <div>
                <div className="hud-text" style={{ color: 'var(--marq-accent)', fontSize: '0.7rem' }}>Version</div>
                <div className="hud-text" style={{ fontSize: '0.9rem' }}>v3.5.Companion</div>
              </div>
            </div>
          </div>

          <div className="header-buttons">
            <button className="neon-btn" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }} onClick={clearChat}>Clear_History</button>
            <button 
              className={`neon-btn self-destruct-btn ${isSelfDestructing ? 'flicker' : ''}`}
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}
              onClick={triggerSelfDestruct}
            >
              {isSelfDestructing ? 'REBOOTING...' : 'Emergency_Reset'}
            </button>
          </div>
        </header>

        {/* Central HUD & Chat - Fills remaining space */}
        <div className="app-grid">
          
          {/* Fixed Chat Relay */}
          <div className="hud-panel" style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            background: 'rgba(15, 23, 42, 0.4)',
            position: 'relative',
            overflow: 'hidden',
          }}>
            <HolographicFace isThinking={isSearching} />
            <div style={{ position: 'relative', zIndex: 10, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
                <div className="hud-text">Communications_Relay</div>
                <div className="hud-text" style={{ opacity: 0.4 }}>Encrypted</div>
              </div>
              
              {/* Message Scroll Area */}
              <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <ChatInterface messages={messages} isTyping={isTyping} />
              </div>

              {/* Input moved inside for fixed positioning */}
              <footer style={{ padding: '0.75rem', borderTop: '1px solid var(--glass-border)', flexShrink: 0 }}>
                <form onSubmit={handleSend} className="input-hud">
                  <Maximize2 size={16} color="var(--marq-accent)" style={{ opacity: 0.5 }} />
                  <input
                    type="text"
                    className="jarvis-input"
                    placeholder="What's on your mind?..."
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    disabled={isSelfDestructing}
                    autoFocus
                  />
                  <Activity size={16} color="var(--marq-accent)" className="flicker" />
                  <div style={{ width: '1px', height: '20px', background: 'var(--marq-accent)', opacity: 0.3 }} />
                  <button type="submit" disabled={!inputText.trim() || isTyping} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem' }}>
                    <Send color={inputText.trim() ? "var(--marq-accent)" : "rgba(255,255,255,0.1)"} size={18} />
                  </button>
                </form>
              </footer>
            </div>
          </div>

          {/* Right Sidebar - Status & Details */}
          <div className="sidebar-container">
            <SystemData status={systemStatus} isSearching={isSearching} />
            
            <div className="hud-panel" style={{ padding: '1rem', minHeight: '150px' }}>
              <div className="hud-text" style={{ marginBottom: '0.75rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                <span>Neural_Visualizer</span>
                {isSearching && (
                  <motion.span 
                    animate={{ opacity: [1, 0, 1] }} 
                    transition={{ repeat: Infinity, duration: 0.8 }}
                    style={{ color: 'var(--marq-accent)', fontSize: '0.65rem' }}
                  >
                    SYNCING...
                  </motion.span>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '4px', opacity: isSearching ? 1 : 0.2 }}>
                {[...Array(24)].map((_, i) => (
                  <motion.div
                    key={i}
                    style={{ height: '20px', background: 'var(--marq-accent)', borderRadius: '1px' }}
                    animate={isSearching ? { 
                      opacity: [0.3, 1, 0.3],
                      scaleY: [1, 1.5, 1]
                    } : { opacity: 0.2 }}
                    transition={{ repeat: Infinity, duration: 0.5, delay: i * 0.03 }}
                  />
                ))}
              </div>
            </div>

            <div className="hud-panel" style={{ padding: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="hud-text" style={{ fontSize: '0.65rem', color: 'var(--marq-accent)' }}>Active_Core</div>
              <div className="hud-text" style={{ fontSize: '0.75rem' }}>{systemStatus.model}</div>
            </div>
            
            <div className="hud-panel" style={{ padding: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <div className={isSearching ? "flicker" : ""}>
                <Activity color="var(--marq-accent)" size={18} />
              </div>
              <div className="hud-text" style={{ fontSize: '0.65rem' }}>
                Signal: <span style={{ color: 'var(--marq-accent)' }}>{systemStatus.link === 'Stable' ? 'STABLE_UPLINK' : 'SYNC_INTERRUPT'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isSelfDestructing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ 
              position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', 
              background: 'rgba(239, 68, 68, 0.15)', zIndex: 1000, 
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none'
            }}
          >
            <div className="hud-text flicker" style={{ fontSize: '4rem', color: 'var(--marq-warn)', fontWeight: 800 }}>
              SYSTEM REBOOT INITIATED
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
