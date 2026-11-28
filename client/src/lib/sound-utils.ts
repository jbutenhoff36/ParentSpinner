// Sound helpers used by the pages. The sounds themselves live in celebration-sound.ts.
import {
  loadClip,
  playClip,
  playFallbackCelebrationSound,
  playMotivationalSuccessSound,
  playNotificationSound,
  playSparkle,
  playSpinStartSound,
  playTick,
  unlockAudio,
} from './celebration-sound';

export const SOUNDS = {
  /** John's recorded "Yay!" (public/sounds/yay.mp3), the reward sound */
  YAY: '/sounds/yay.mp3',
};

let ready = false;

/** Unlock audio on a user tap and preload the reward clip. Safe to call often. */
export function initAudioSystem(): void {
  unlockAudio();
  if (ready) return;
  ready = true;
  loadClip(SOUNDS.YAY);
}

/** The reward sound: the "Yay!" clip over a sparkle. Falls back to a synth fanfare. */
export function playCelebrationSound(volume: number = 0.6): void {
  playSparkle(volume * 0.6);
  playClip(SOUNDS.YAY, Math.min(1, volume * 1.5)).catch(() => playFallbackCelebrationSound(volume));
}

/** Kept for older callers; same as the reward sound. */
export function playCustomYaySound(volume: number = 0.6): Promise<void> {
  playCelebrationSound(volume);
  return Promise.resolve();
}

export function playSpinnerStartSound(volume: number = 0.4): void {
  playSpinStartSound(volume);
}

export function playSuccessSound(volume: number = 0.5): void {
  playMotivationalSuccessSound(volume);
}

export function playWheelTick(volume: number = 0.3): void {
  playTick(volume);
}

export function playNotificationChime(volume: number = 0.4): void {
  playNotificationSound(volume);
}
