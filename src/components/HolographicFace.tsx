import React, { useEffect } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';
import hologramImg from '../assets/hologram_face_processed.png';

interface Props {
  isThinking?: boolean;
}

export const HolographicFace: React.FC<Props> = ({ isThinking = false }) => {
  // Smooth spring physics for natural movement
  const springConfig = { stiffness: 40, damping: 25 };
  const mouseX = useSpring(0, springConfig);
  const mouseY = useSpring(0, springConfig);

  // Map mouse position to aggressive "Look-At" parallax
  // Layer 1 (Foreground Features - Eyes/Nose): The "Gaze" layer
  const rotateX_FG = useTransform(mouseY, [-0.5, 0.5], [15, -15]);
  const rotateY_FG = useTransform(mouseX, [-0.5, 0.5], [-25, 25]);
  const x_FG = useTransform(mouseX, [-0.5, 0.5], [-40, 40]); // Aggressive shift to follow cursor
  const y_FG = useTransform(mouseY, [-0.5, 0.5], [-25, 25]);

  // Layer 2 (Midground/Main Head)
  const rotateX_MG = useTransform(mouseY, [-0.5, 0.5], [8, -8]);
  const rotateY_MG = useTransform(mouseX, [-0.5, 0.5], [-12, 12]);
  const x_MG = useTransform(mouseX, [-0.5, 0.5], [-10, 10]);

  // Layer 3 (Background Anchor): Stays very still to provide depth contrast
  const rotateX_BG = useTransform(mouseY, [-0.5, 0.5], [2, -2]);
  const rotateY_BG = useTransform(mouseX, [-0.5, 0.5], [-4, 4]);
  const x_BG = useTransform(mouseX, [-0.5, 0.5], [10, -10]); 

  // Simulation of "Depth Pinch" (Scaling the features as they look toward edges)
  const scale_FG = useTransform(mouseX, [-0.5, 0, 0.5], [1.05, 1, 1.05]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) - 0.5;
      const y = (e.clientY / window.innerHeight) - 0.5;
      mouseX.set(x);
      mouseY.set(y);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [mouseX, mouseY]);

  return (
    <div style={{
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'none',
      zIndex: 1,
      overflow: 'hidden',
      perspective: '1200px', // Enhanced depth
    }}>
      <div style={{ position: 'relative', width: '750px', height: '750px', transformStyle: 'preserve-3d' }}>
        
        {/* --- LAYER 3: BACKGROUND DEPTH / SHADOW --- */}
        <motion.div
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            rotateX: rotateX_BG,
            rotateY: rotateY_BG,
            x: x_BG,
            transformStyle: 'preserve-3d',
            translateZ: '-40px', // Pushed back in 3D
            opacity: 0.4,
          }}
        >
          <img 
            src={hologramImg} 
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              filter: 'brightness(0.5) blur(8px) saturate(2) hue-rotate(-20deg)', 
              mixBlendMode: 'plus-lighter',
            }}
          />
        </motion.div>

        {/* --- LAYER 2: MAIN MIDGROUND --- */}
        <motion.div
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            rotateX: rotateX_MG,
            rotateY: rotateY_MG,
            x: x_MG,
            transformStyle: 'preserve-3d',
            translateZ: '0px',
            opacity: isThinking ? 0.9 : 0.7,
          }}
          animate={isThinking ? { 
            scale: [1, 1.01, 1],
            filter: ["brightness(1.1)", "brightness(1.25)", "brightness(1.1)"]
          } : { scale: 1, filter: "brightness(1.1)" }}
          transition={{ duration: isThinking ? 1.5 : 3, repeat: Infinity, ease: "easeInOut" }}
        >
          <img 
            src={hologramImg} 
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              filter: `brightness(1.1) contrast(1.1) saturate(1.1)`, 
              mixBlendMode: 'screen',
            }}
          />
        </motion.div>

        {/* --- LAYER 1: FOREGROUND FEATURES (Eyes/Nose/Highlights) --- */}
        <motion.div
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            rotateX: rotateX_FG,
            rotateY: rotateY_FG,
            x: x_FG,
            y: y_FG,
            scale: scale_FG,
            transformStyle: 'preserve-3d',
            translateZ: '60px', 
            zIndex: 10,
          }}
        >
          {/* Chromatic Highlights */}
          <motion.img 
            src={hologramImg} 
            animate={{ 
              opacity: isThinking ? [0.4, 0.7, 0.4] : 0.1, 
              scale: isThinking ? [1, 1.02, 1] : 1
            }}
            transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut" }}
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              filter: 'brightness(2.5) contrast(1.5) blur(1px) hue-rotate(15deg)', 
              mixBlendMode: 'color-dodge',
            }}
          />
        </motion.div>

        {/* --- VOLUMETRIC LIGHTING OVERLAY --- */}
        <motion.div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'radial-gradient(circle at center, rgba(34, 211, 238, 0.1) 0%, transparent 60%)',
            x: useTransform(mouseX, [-0.5, 0.5], [50, -50]), // Light moves opposite to mouse
            y: useTransform(mouseY, [-0.5, 0.5], [50, -50]),
            zIndex: 5,
            mixBlendMode: 'overlay',
            pointerEvents: 'none'
          }}
        />

        {/* Digital Scanline Overlay */}
        <motion.div
          animate={{ y: [-400, 400], opacity: [0, 0.8, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          style={{
            position: 'absolute',
            width: '100%',
            height: '2px',
            background: 'linear-gradient(90deg, transparent, rgba(34, 211, 238, 0.8), transparent)',
            zIndex: 20,
            translateZ: '60px'
          }}
        />
      </div>
    </div>
  );
};
