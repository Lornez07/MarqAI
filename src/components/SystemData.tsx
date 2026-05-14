import React from 'react';
import { motion } from 'framer-motion';
import { Thermometer, Cpu } from 'lucide-react';

interface SystemDataProps {
  status: {
    cpu: number;
    temp: number;
    link: string;
  };
  isSearching?: boolean;
}

export const SystemData: React.FC<SystemDataProps> = ({ status, isSearching = false }) => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem',
      alignItems: 'flex-end',
      pointerEvents: 'none',
      width: '100%'
    }}>
      {/* CPU Widget */}
      <div className="hud-panel" style={{ padding: '0.75rem 1rem', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="hud-text" style={{ color: 'var(--marq-accent)', fontSize: '0.7rem' }}>
            <Cpu size={12} style={{ marginRight: '0.4rem' }} /> NEURAL_LOAD
          </div>
          <div className="hud-text" style={{ fontSize: '0.8rem' }}>{status.cpu}%</div>
        </div>
        <div style={{ width: '100%', height: '2px', background: 'rgba(34, 211, 238, 0.1)', marginTop: '0.5rem', overflow: 'hidden' }}>
          <motion.div 
            style={{ height: '100%', background: 'var(--marq-accent)' }}
            animate={{ width: `${status.cpu}%` }}
          />
        </div>
      </div>

      {/* Temp Widget */}
      <div className="hud-panel" style={{ padding: '0.75rem 1rem', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="hud-text" style={{ fontSize: '0.7rem' }}>
            <Thermometer size={12} style={{ marginRight: '0.4rem' }} /> CORE_THERMAL
          </div>
          <div className="hud-text" style={{ fontSize: '0.8rem', color: status.temp > 35 ? 'var(--marq-warn)' : 'var(--marq-accent)' }}>
            {status.temp}°C
          </div>
        </div>
      </div>

      {/* Waveform Visualization (Neural Pulse) */}
      <div className="hud-panel" style={{ 
        padding: '0.75rem', 
        width: '100%', 
        height: '80px', 
        display: 'flex', 
        flexDirection: 'column',
        boxSizing: 'border-box',
        position: 'relative'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div className="hud-text" style={{ fontSize: '0.6rem', opacity: 0.6 }}>NEURAL_PULSE</div>
          <div className="hud-text" style={{ fontSize: '0.6rem', color: isSearching ? 'var(--marq-accent)' : 'rgba(255,255,255,0.4)' }}>
            {isSearching ? 'ACTIVE' : 'IDLE'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', height: '100%' }}>
          {[...Array(12)].map((_, i) => (
            <motion.div
              key={i}
              style={{ flex: 1, background: 'var(--marq-accent)', minHeight: '2px', borderRadius: '1px' }}
              animate={{ 
                height: isSearching ? [4, Math.random() * 35 + 5, 4] : [2, Math.random() * 8 + 2, 2],
                opacity: isSearching ? [0.4, 1, 0.4] : [0.2, 0.4, 0.2]
              }}
              transition={{ 
                repeat: Infinity, 
                duration: isSearching ? 0.3 + Math.random() * 0.2 : 1.0, 
                ease: 'easeInOut' 
              }}
            />
          ))}
        </div>
      </div>

      {/* Sync Status */}
      <div className="hud-panel" style={{ padding: '0.5rem 0.75rem', width: '100%', boxSizing: 'border-box', display: 'flex', justifyContent: 'space-between' }}>
        <div className="hud-text" style={{ fontSize: '0.65rem' }}>LINK_STATUS</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <motion.div 
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
            style={{ width: '6px', height: '6px', borderRadius: '50%', background: status.link === 'Stable' ? '#10b981' : '#f59e0b' }} 
          />
          <div className="hud-text" style={{ fontSize: '0.7rem', color: 'white' }}>{status.link}</div>
        </div>
      </div>
    </div>
  );
};
