import React from 'react';
import { motion } from 'framer-motion';
import { User } from 'lucide-react';

export const MarqAvatar: React.FC = () => {
  return (
    <div style={{ position: 'relative', width: '60px', height: '60px' }}>
      <motion.div
        className="avatar-pulse"
        animate={{
          boxShadow: [
            '0 0 20px rgba(34, 211, 238, 0.4)',
            '0 0 40px rgba(34, 211, 238, 0.6)',
            '0 0 20px rgba(34, 211, 238, 0.4)'
          ]
        }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <User color="white" size={30} />
      </motion.div>
      <div style={{
        position: 'absolute',
        top: -2,
        right: -2,
        width: '12px',
        height: '12px',
        backgroundColor: '#10b981',
        borderRadius: '50%',
        border: '2px solid var(--marq-bg)'
      }} />
    </div>
  );
};
