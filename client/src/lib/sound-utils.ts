// Sound utility functions
import {
  playFallbackCelebrationSound,
  playMotivationalSuccessSound,
  playSpinStartSound
} from './celebration-sound';

// Sound file URLs (served from /public/sounds when present)
export const SOUNDS = {
  CELEBRATION_OGG: '/sounds/celebration.ogg',
  CELEBRATION_WAV: '/sounds/celebration.wav',
  CELEBRATION_MP3: '/sounds/celebration.mp3',
  CELEBRATION_M4A: '/sounds/celebration.m4a',
  CUSTOM_YAY: '/sounds/custom/custom-yay.m4a',
  SUCCESS_OGG: '/sounds/success.ogg',
  SUCCESS_WAV: '/sounds/success.wav',
  SUCCESS: '/sounds/success.mp3',
};

const audioCache: Record<string, HTMLAudioElement> = {};
let audioUnlocked = false;

/** Unlock audio on the first user interaction (needed on mobile browsers). */
export function initAudioSystem(): void {
  if (audioUnlocked) return;
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    const audioContext = new AudioContext();
    const buffer = audioContext.createBuffer(1, 1, 22050);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    if (typeof source.start === 'function') {
      source.start(0);
    } else {
      (source as any).noteOn(0);
    }

    [SOUNDS.CUSTOM_YAY].forEach(url => {
      if (!url) return;
      const audio = new Audio(url);
      audioCache[url] = audio;
      audio.load();
      audio.onerror = () => {
        delete audioCache[url];
      };
    });

    audioUnlocked = true;
  } catch (error) {
    console.error('Failed to initialize audio system:', error);
  }
}

export function playSound(soundUrl: string, volume: number = 0.5): Promise<void> {
  if (!audioUnlocked) initAudioSystem();
  return new Promise((resolve, reject) => {
    try {
      let audio = audioCache[soundUrl];
      if (!audio) {
        audio = new Audio(soundUrl);
        audioCache[soundUrl] = audio;
      }
      audio.currentTime = 0;
      audio.volume = Math.min(1, Math.max(0, volume));
      const playPromise = audio.play();
      if (playPromise) {
        playPromise.then(() => resolve()).catch(reject);
      } else {
        resolve();
      }
    } catch (error) {
      reject(error);
    }
  });
}

export function playCelebrationSound(volume: number = 0.5): void {
  playCustomYaySound(volume).catch(() => playFallbackCelebrationSound(volume));
}

export function playSpinnerStartSound(volume: number = 0.4): void {
  playSpinStartSound(volume);
}

export function playSuccessSound(volume: number = 0.5): void {
  playMotivationalSuccessSound(volume);
}

export function playCustomYaySound(volume: number = 0.8): Promise<void> {
  if (!audioUnlocked) initAudioSystem();
  if (!SOUNDS.CUSTOM_YAY) return Promise.reject(new Error("Custom Yay sound not available"));
  return playSound(SOUNDS.CUSTOM_YAY, volume);
}
