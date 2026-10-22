import React from 'react';
import { motion } from 'framer-motion';

export const MarqHUD: React.FC = () => {
  return (
    <div aria-hidden="true" style={{
      position: 'absolute',
      width: '300px',
      height: '300px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'none',
      zIndex: 0
    }}>
      {/* Outer Ring */}
      <motion.div
        style={{
          width: '100%',
          height: '100%',
          border: '1px dashed var(--marq-accent)',
          borderRadius: '50%',
          opacity: 0.2
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
      />
      
      {/* Middle Ring with notches */}
      <motion.div
        style={{
          position: 'absolute',
          width: '80%',
          height: '80%',
          border: '2px solid transparent',
          borderTopColor: 'var(--marq-accent)',
          borderBottomColor: 'var(--marq-accent)',
          borderRadius: '50%',
          opacity: 0.4
        }}
        animate={{ rotate: -360 }}
        transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
      />
      
      {/* Pulsing hex layer */}
      <motion.div
        style={{
          position: 'absolute',
          width: '60%',
          height: '60%',
          background: 'radial-gradient(circle, var(--marq-accent-glow) 0%, transparent 70%)',
          borderRadius: '50%',
          opacity: 0.3
        }}
        animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.3, 0.1] }}
        transition={{ duration: 4, repeat: Infinity }}
      />
      
      {/* Crosshair lines */}
      <div style={{ position: 'absolute', width: '120%', height: '1px', background: 'var(--marq-accent)', opacity: 0.1 }} />
      <div style={{ position: 'absolute', width: '1px', height: '120%', background: 'var(--marq-accent)', opacity: 0.1 }} />
    </div>
  );
};
