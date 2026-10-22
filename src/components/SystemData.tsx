import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Clock, Cpu } from 'lucide-react';

interface SystemDataProps {
  status: {
    model: string;
    link: 'Stable' | 'Restricted';
    requests: number;
    lastLatencyMs: number | null;
  };
  isSearching?: boolean;
}

// Deterministic waveform shape. Rendering must stay pure, so the bar heights,
// durations and offsets are fixed values rather than Math.random() calls.
const WAVE_PEAKS = [18, 32, 12, 40, 24, 36, 15, 42, 20, 28, 14, 38];
const WAVE_OFFSETS = [0, 0.06, 0.12, 0.03, 0.09, 0.15, 0.05, 0.11, 0.02, 0.08, 0.14, 0.04];

function formatValue(value: number | null, suffix: string): string {
  return value === null ? '--' : `${value}${suffix}`;
}

export const SystemData: React.FC<SystemDataProps> = ({ status, isSearching = false }) => {
  const healthy = status.link === 'Stable';
  const reduceMotion = useReducedMotion();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%' }}>
      {/* Measured counters, never fabricated */}
      <div className="hud-panel" style={{ padding: '0.75rem 1rem', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="hud-text" style={{ color: 'var(--marq-accent)', fontSize: '0.7rem' }}>
            <Cpu size={12} style={{ marginRight: '0.4rem' }} aria-hidden="true" /> REQUESTS
          </div>
          <div className="hud-text" style={{ fontSize: '0.8rem' }}>{status.requests}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
          <div className="hud-text" style={{ fontSize: '0.7rem' }}>
            <Clock size={12} style={{ marginRight: '0.4rem' }} aria-hidden="true" /> LAST_LATENCY
          </div>
          <div className="hud-text" style={{ fontSize: '0.8rem' }}>{formatValue(status.lastLatencyMs, 'ms')}</div>
        </div>
      </div>

      {/* Activity waveform */}
      <div
        className="hud-panel"
        style={{ padding: '0.75rem', width: '100%', height: '80px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div className="hud-text" style={{ fontSize: '0.6rem', opacity: 0.75 }}>ACTIVITY</div>
          <div
            className="hud-text"
            style={{ fontSize: '0.6rem', color: isSearching ? 'var(--marq-accent)' : 'var(--marq-text-soft)' }}
          >
            {isSearching ? 'STREAMING' : 'IDLE'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', height: '100%' }} aria-hidden="true">
          {reduceMotion
            ? WAVE_PEAKS.map((peak, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    background: 'var(--marq-accent)',
                    height: `${2 + (peak % 7)}px`,
                    opacity: 0.35,
                    borderRadius: '1px',
                  }}
                />
              ))
            : WAVE_PEAKS.map((peak, i) => (
                <motion.div
                  key={i}
                  style={{ flex: 1, background: 'var(--marq-accent)', minHeight: '2px', borderRadius: '1px' }}
                  animate={{
                    height: isSearching ? [4, peak, 4] : [2, 2 + (peak % 7), 2],
                    opacity: isSearching ? [0.4, 1, 0.4] : [0.2, 0.35, 0.2],
                  }}
                  transition={{
                    repeat: Infinity,
                    duration: isSearching ? 0.36 : 1.0,
                    delay: WAVE_OFFSETS[i],
                    ease: 'easeInOut',
                  }}
                />
              ))}
        </div>
      </div>

      {/* Link status: color is never the only signal */}
      <div
        className="hud-panel"
        style={{ padding: '0.5rem 0.75rem', width: '100%', boxSizing: 'border-box', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <div className="hud-text" style={{ fontSize: '0.65rem' }}>LINK</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <motion.div
            animate={healthy ? { opacity: [1, 0.5, 1] } : { opacity: 1 }}
            transition={{ duration: 1, repeat: Infinity }}
            style={{ width: '6px', height: '6px', borderRadius: '50%', background: healthy ? '#10b981' : '#f59e0b' }}
            aria-hidden="true"
          />
          <div className="hud-text" style={{ fontSize: '0.7rem', color: 'white' }}>
            {healthy ? 'STABLE' : 'DEGRADED'}
          </div>
        </div>
      </div>
    </div>
  );
};
