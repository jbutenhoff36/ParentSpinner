function getAudioContextCtor(): typeof AudioContext | undefined {
  return window.AudioContext || (window as any).webkitAudioContext;
}

/** Triumphant fanfare made with the Web Audio API. */
export function playFallbackCelebrationSound(volume: number = 0.5): void {
  try {
    const Ctor = getAudioContextCtor();
    if (!Ctor) return;
    const audioCtx = new Ctor();
    const masterGain = audioCtx.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(audioCtx.destination);

    const notes = [
      { frequency: 392.0, duration: 0.15 },
      { frequency: 587.33, duration: 0.15 },
      { frequency: 783.99, duration: 0.25 },
      { frequency: 987.77, duration: 0.35 },
      { frequency: 783.99, duration: 0.2 },
      { frequency: 1174.66, duration: 0.45 },
    ];

    let startTime = audioCtx.currentTime;
    notes.forEach((note, index) => {
      const oscillator = audioCtx.createOscillator();
      const noteGain = audioCtx.createGain();
      oscillator.connect(noteGain);
      noteGain.connect(masterGain);
      oscillator.type = 'triangle';
      oscillator.frequency.value = note.frequency;
      noteGain.gain.setValueAtTime(0, startTime);
      noteGain.gain.linearRampToValueAtTime(0.8, startTime + 0.03);
      noteGain.gain.setValueAtTime(0.8, startTime + note.duration * 0.7);
      noteGain.gain.linearRampToValueAtTime(0, startTime + note.duration);
      oscillator.start(startTime);
      oscillator.stop(startTime + note.duration + 0.05);
      startTime += note.duration - (index < 2 ? 0.08 : 0.04);
    });

    const addPercussion = (startOffset: number, frequency: number, duration: number) => {
      const percOsc = audioCtx.createOscillator();
      const percGain = audioCtx.createGain();
      const percFilter = audioCtx.createBiquadFilter();
      percOsc.connect(percFilter);
      percFilter.connect(percGain);
      percGain.connect(masterGain);
      percOsc.type = 'sine';
      percOsc.frequency.value = frequency;
      percFilter.type = 'lowpass';
      percFilter.frequency.value = 200;
      percFilter.Q.value = 5;
      const t = audioCtx.currentTime + startOffset;
      percGain.gain.setValueAtTime(0, t);
      percGain.gain.linearRampToValueAtTime(0.5, t + 0.01);
      percGain.gain.exponentialRampToValueAtTime(0.001, t + duration);
      percOsc.start(t);
      percOsc.stop(t + duration + 0.01);
    };
    addPercussion(0, 150, 0.1);
    addPercussion(0.3, 120, 0.08);
    addPercussion(0.6, 130, 0.12);
    addPercussion(1.0, 100, 0.15);

    const powerUpOsc = audioCtx.createOscillator();
    const powerUpGain = audioCtx.createGain();
    powerUpOsc.connect(powerUpGain);
    powerUpGain.connect(masterGain);
    powerUpOsc.type = 'sine';
    powerUpOsc.frequency.setValueAtTime(300, audioCtx.currentTime + 0.2);
    powerUpOsc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.8);
    powerUpGain.gain.setValueAtTime(0, audioCtx.currentTime + 0.2);
    powerUpGain.gain.linearRampToValueAtTime(0.25, audioCtx.currentTime + 0.4);
    powerUpGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.9);
    powerUpOsc.start(audioCtx.currentTime + 0.2);
    powerUpOsc.stop(audioCtx.currentTime + 1);

    setTimeout(() => {
      const chimeOsc = audioCtx.createOscillator();
      const chimeGain = audioCtx.createGain();
      chimeOsc.connect(chimeGain);
      chimeGain.connect(masterGain);
      chimeOsc.type = 'sine';
      chimeOsc.frequency.value = 1318.51;
      chimeGain.gain.setValueAtTime(0, audioCtx.currentTime);
      chimeGain.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.02);
      chimeGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.5);
      chimeOsc.start(audioCtx.currentTime);
      chimeOsc.stop(audioCtx.currentTime + 1.5);
    }, 900);
  } catch (error) {
    console.error('Error playing celebration sound:', error);
  }
}

/** Short upward sweep when the wheel starts spinning. */
export function playSpinStartSound(volume: number = 0.4): void {
  try {
    const Ctor = getAudioContextCtor();
    if (!Ctor) return;
    const audioCtx = new Ctor();
    const masterGain = audioCtx.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(audioCtx.destination);

    const sweepOsc = audioCtx.createOscillator();
    const sweepGain = audioCtx.createGain();
    sweepOsc.connect(sweepGain);
    sweepGain.connect(masterGain);
    sweepOsc.type = 'sine';
    sweepOsc.frequency.setValueAtTime(220, audioCtx.currentTime);
    sweepOsc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.2);
    sweepGain.gain.setValueAtTime(0, audioCtx.currentTime);
    sweepGain.gain.linearRampToValueAtTime(0.7, audioCtx.currentTime + 0.05);
    sweepGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.25);
    sweepOsc.start(audioCtx.currentTime);
    sweepOsc.stop(audioCtx.currentTime + 0.3);

    const clickOsc = audioCtx.createOscillator();
    const clickGain = audioCtx.createGain();
    clickOsc.connect(clickGain);
    clickGain.connect(masterGain);
    clickOsc.type = 'triangle';
    clickOsc.frequency.value = 1200;
    clickGain.gain.setValueAtTime(0, audioCtx.currentTime);
    clickGain.gain.linearRampToValueAtTime(0.4, audioCtx.currentTime + 0.01);
    clickGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
    clickOsc.start(audioCtx.currentTime);
    clickOsc.stop(audioCtx.currentTime + 0.1);
  } catch (error) {
    console.error('Error playing spin start sound:', error);
  }
}

/** Short rising chord when the wheel lands. */
export function playMotivationalSuccessSound(volume: number = 0.5): void {
  if ((window as any).celebrationSoundPlaying) return;
  try {
    (window as any).celebrationSoundPlaying = true;
    const Ctor = getAudioContextCtor();
    if (!Ctor) {
      (window as any).celebrationSoundPlaying = false;
      return;
    }
    const audioCtx = new Ctor();
    const masterGain = audioCtx.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(audioCtx.destination);

    [523.25, 659.25, 783.99].forEach((frequency, index) => {
      const duration = index === 2 ? 0.25 : 0.12;
      const oscillator = audioCtx.createOscillator();
      const noteGain = audioCtx.createGain();
      oscillator.connect(noteGain);
      noteGain.connect(masterGain);
      oscillator.type = 'triangle';
      oscillator.frequency.value = frequency;
      const startTime = audioCtx.currentTime + index * 0.04;
      noteGain.gain.setValueAtTime(0, startTime);
      noteGain.gain.linearRampToValueAtTime(0.6, startTime + 0.02);
      noteGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    });

    setTimeout(() => {
      const bellOsc = audioCtx.createOscillator();
      const bellGain = audioCtx.createGain();
      bellOsc.connect(bellGain);
      bellGain.connect(masterGain);
      bellOsc.type = 'sine';
      bellOsc.frequency.value = 1046.5;
      bellGain.gain.setValueAtTime(0, audioCtx.currentTime);
      bellGain.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 0.01);
      bellGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
      bellOsc.start(audioCtx.currentTime);
      bellOsc.stop(audioCtx.currentTime + 0.4);
    }, 150);

    setTimeout(() => {
      (window as any).celebrationSoundPlaying = false;
    }, 600);
  } catch (error) {
    console.error('Error playing success sound:', error);
    (window as any).celebrationSoundPlaying = false;
  }
}
