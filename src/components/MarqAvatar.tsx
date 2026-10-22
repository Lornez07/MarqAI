import React from 'react';
import { User } from 'lucide-react';

export const MarqAvatar: React.FC = () => {
  return (
    <div style={{ position: 'relative', width: '60px', height: '60px' }} aria-hidden="true">
      <div
        className="avatar-pulse"
        style={{
          boxShadow: '0 0 24px rgba(34, 211, 238, 0.45)',
        }}
      >
        <User color="white" size={30} />
      </div>
      <div
        style={{
          position: 'absolute',
          top: -2,
          right: -2,
          width: '12px',
          height: '12px',
          backgroundColor: '#10b981',
          borderRadius: '50%',
          border: '2px solid var(--marq-bg)',
        }}
      />
    </div>
  );
};
