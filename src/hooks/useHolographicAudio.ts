import { useEffect, useRef } from 'react';

export function useHolographicAudio() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const humOscRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  const startHum = () => {
    if (audioContextRef.current) return;

    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Create a low-frequency hum (55Hz - A1)
    const osc = audioContextRef.current.createOscillator();
    const gain = audioContextRef.current.createGain();
    const filter = audioContextRef.current.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(55, audioContextRef.current.currentTime);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(200, audioContextRef.current.currentTime);

    gain.gain.setValueAtTime(0, audioContextRef.current.currentTime);
    gain.gain.linearRampToValueAtTime(0.02, audioContextRef.current.currentTime + 2); // Very quiet

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioContextRef.current.destination);

    osc.start();
    humOscRef.current = osc;
    gainNodeRef.current = gain;
  };

  const playBeep = (freq = 440, type: OscillatorType = 'sine', volume = 0.05) => {
    if (!audioContextRef.current) return;
    
    const osc = audioContextRef.current.createOscillator();
    const gain = audioContextRef.current.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioContextRef.current.currentTime);
    
    gain.gain.setValueAtTime(volume, audioContextRef.current.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContextRef.current.currentTime + 0.1);
    
    osc.connect(gain);
    gain.connect(audioContextRef.current.destination);
    
    osc.start();
    osc.stop(audioContextRef.current.currentTime + 0.1);
  };

  const playChirp = () => {
    playBeep(880, 'sine', 0.02);
    setTimeout(() => playBeep(1320, 'sine', 0.01), 50);
  };

  useEffect(() => {
    // We can't start audio until user interaction
    const initAudio = () => {
      startHum();
      window.removeEventListener('click', initAudio);
    };
    window.addEventListener('click', initAudio);

    return () => {
      if (humOscRef.current) humOscRef.current.stop();
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

  return { playBeep, playChirp };
}
