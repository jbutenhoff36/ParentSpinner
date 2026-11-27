import { useEffect, useState } from 'react';
import ReactConfetti from 'react-confetti';
import { useWindowSize } from '@/hooks/use-window-size';
import { playCelebrationSound, playCustomYaySound, initAudioSystem } from '../../lib/sound-utils';

interface ConfettiCelebrationProps {
  active?: boolean;
  duration?: number;
  onComplete?: () => void;
  soundVolume?: number;
  useCustomSound?: boolean;
}

export function ConfettiCelebration({
  active = false,
  duration = 5000,
  onComplete,
  soundVolume = 0.5,
  useCustomSound = false,
}: ConfettiCelebrationProps) {
  const [isActive, setIsActive] = useState(active);
  const { width, height } = useWindowSize();

  useEffect(() => {
    setIsActive(active);
    if (active) {
      initAudioSystem();
      setTimeout(() => {
        if (useCustomSound) {
          playCustomYaySound(soundVolume).catch(() => playCelebrationSound(soundVolume));
        } else {
          playCelebrationSound(soundVolume);
        }
      }, 100);
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    if (active && duration > 0) {
      timer = setTimeout(() => {
        setIsActive(false);
        onComplete?.();
      }, duration);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [active, duration, onComplete, soundVolume, useCustomSound]);

  if (!isActive) return null;

  return (
    <ReactConfetti
      width={width}
      height={height}
      recycle={false}
      numberOfPieces={500}
      tweenDuration={10000}
      colors={['#3B82F6', '#EF4444', '#F59E0B', '#10B981', '#7C3AED', '#84CC16', '#F97316', '#EC4899']}
    />
  );
}
