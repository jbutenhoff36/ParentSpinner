/**
 * KidSpin sound engine. Every sound except the "Yay" clip is synthesized here with the
 * Web Audio API, so there are no third-party sound files to license.
 *
 * One shared AudioContext is used for everything. Browsers only allow audio after a tap,
 * so call unlockAudio() from a tap handler (the Spin button does this).
 */

type Ctx = AudioContext;
let ctx: Ctx | null = null;
let noise: AudioBuffer | null = null;
let master: GainNode | null = null;

export function getAudio(): { ctx: Ctx; out: GainNode } | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor() as Ctx;
      // A gentle limiter keeps layered sounds from clipping on phone speakers
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.knee.value = 8;
      comp.ratio.value = 6;
      comp.attack.value = 0.002;
      comp.release.value = 0.12;
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(comp);
      comp.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return { ctx, out: master! };
  } catch {
    return null;
  }
}

/** Call from a tap/click so later sounds are allowed to play. */
export function unlockAudio(): void {
  const a = getAudio();
  if (!a) return;
  // A silent blip is what actually unlocks audio on iOS
  const src = a.ctx.createBufferSource();
  src.buffer = a.ctx.createBuffer(1, 1, 22050);
  src.connect(a.out);
  src.start(0);
}

function noiseBuffer(c: Ctx): AudioBuffer {
  if (noise && noise.sampleRate === c.sampleRate) return noise;
  const len = Math.floor(c.sampleRate * 1.5);
  noise = c.createBuffer(1, len, c.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return noise;
}

function env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

/** Glassy FM bell, the core of the modern "ding" sounds. */
function bell(c: Ctx, out: AudioNode, freq: number, t: number, vol: number, decay = 0.6, ratio = 3.5) {
  const car = c.createOscillator();
  const mod = c.createOscillator();
  const modGain = c.createGain();
  const g = c.createGain();
  car.type = 'sine';
  mod.type = 'sine';
  car.frequency.value = freq;
  mod.frequency.value = freq * ratio;
  modGain.gain.setValueAtTime(freq * 1.6, t);
  modGain.gain.exponentialRampToValueAtTime(freq * 0.05, t + decay * 0.6);
  mod.connect(modGain).connect(car.frequency);
  car.connect(g).connect(out);
  env(g, t, vol, 0.004, decay);
  car.start(t);
  mod.start(t);
  car.stop(t + decay + 0.05);
  mod.stop(t + decay + 0.05);
}

/** Round, woody "pop" (like a marimba or a bubble). */
function pop(c: Ctx, out: AudioNode, freq: number, t: number, vol: number, decay = 0.18) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq * 1.5, t);
  o.frequency.exponentialRampToValueAtTime(freq, t + 0.025);
  o.connect(g).connect(out);
  env(g, t, vol, 0.003, decay);
  o.start(t);
  o.stop(t + decay + 0.05);

  const o2 = c.createOscillator();
  const g2 = c.createGain();
  o2.type = 'sine';
  o2.frequency.value = freq * 4;
  o2.connect(g2).connect(out);
  env(g2, t, vol * 0.18, 0.002, decay * 0.3);
  o2.start(t);
  o2.stop(t + decay);
}

/** Filtered noise sweep, used for the whoosh. */
function swoosh(c: Ctx, out: AudioNode, t: number, dur: number, from: number, to: number, vol: number) {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(from, t);
  bp.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.55);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp).connect(g).connect(out);
  src.start(t);
  src.stop(t + dur + 0.05);
}

/** Tiny bright "tk" for each peg the pointer passes while the wheel turns. */
let lastTick = -1;
export function playTick(volume = 0.35, pitch = 1): void {
  const a = getAudio();
  if (!a || a.ctx.state !== 'running') return;
  const { ctx: c, out } = a;
  const t = c.currentTime;
  if (t - lastTick < 0.03) return; // very fast spins would turn into a buzz
  lastTick = t;

  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const hp = c.createBiquadFilter();
  hp.type = 'bandpass';
  hp.frequency.value = 4200 * pitch;
  hp.Q.value = 3;
  const g = c.createGain();
  env(g, t, volume * 2.2, 0.001, 0.025);
  src.connect(hp).connect(g).connect(out);
  src.start(t, Math.random());
  src.stop(t + 0.04);

  const o = c.createOscillator();
  const og = c.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(1900 * pitch, t);
  o.frequency.exponentialRampToValueAtTime(1100 * pitch, t + 0.03);
  o.connect(og).connect(out);
  env(og, t, volume * 1.3, 0.001, 0.035);
  o.start(t);
  o.stop(t + 0.05);
}

/** Rising whoosh with a two-note sparkle when the wheel starts. */
export function playSpinStartSound(volume: number = 0.4): void {
  const a = getAudio();
  if (!a) return;
  const { ctx: c, out } = a;
  const t = c.currentTime + 0.01;
  swoosh(c, out, t, 0.45, 500, 4500, volume * 0.9);
  pop(c, out, 523.25, t, volume * 0.7, 0.14); // C5
  pop(c, out, 783.99, t + 0.08, volume * 0.7, 0.2); // G5
  bell(c, out, 1567.98, t + 0.16, volume * 0.25, 0.35, 2); // G6 shimmer
}

/** Soft two-note "ta-da" when the chore or fighting wheel lands. Upbeat but not a party. */
export function playMotivationalSuccessSound(volume: number = 0.5): void {
  const a = getAudio();
  if (!a) return;
  const { ctx: c, out } = a;
  const t = c.currentTime + 0.01;
  pop(c, out, 392.0, t, volume * 0.8, 0.16); // G4
  pop(c, out, 587.33, t + 0.11, volume * 0.8, 0.3); // D5
  bell(c, out, 1174.66, t + 0.11, volume * 0.22, 0.5, 3); // D6
}

/** Bright sparkle arpeggio, layered under the "Yay" clip. */
export function playSparkle(volume: number = 0.4): void {
  const a = getAudio();
  if (!a) return;
  const { ctx: c, out } = a;
  const t = c.currentTime + 0.01;
  // C major 9 sweep up: C6 E6 G6 B6 D7
  [1046.5, 1318.51, 1567.98, 1975.53, 2349.32].forEach((f, i) => bell(c, out, f, t + i * 0.055, volume * 0.35, 0.7, 2));
  pop(c, out, 130.81, t, volume * 0.9, 0.25); // low thump underneath
}

/** Synth fanfare used if the "Yay" clip can't load. */
export function playFallbackCelebrationSound(volume: number = 0.5): void {
  const a = getAudio();
  if (!a) return;
  const { ctx: c, out } = a;
  const t = c.currentTime + 0.01;
  playSparkle(volume);
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => pop(c, out, f, t + 0.3 + i * 0.09, volume * 0.7, 0.25));
  [1046.5, 1318.51, 1567.98].forEach((f) => bell(c, out, f, t + 0.66, volume * 0.3, 1.2, 2));
}

/** Two-tone "ding-ding" for live notifications (like a good day being logged). */
export function playNotificationSound(volume: number = 0.4): void {
  const a = getAudio();
  if (!a) return;
  const { ctx: c, out } = a;
  const t = c.currentTime + 0.01;
  bell(c, out, 1318.51, t, volume * 0.5, 0.5, 3.5); // E6
  bell(c, out, 1760.0, t + 0.12, volume * 0.5, 0.8, 3.5); // A6
}

/** Decode an audio file into the shared context so it can play any time after unlock. */
const buffers: Record<string, Promise<AudioBuffer | null>> = {};
export function loadClip(url: string): Promise<AudioBuffer | null> {
  const a = getAudio();
  if (!a) return Promise.resolve(null);
  if (!buffers[url]) {
    buffers[url] = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then(
        (data) =>
          new Promise<AudioBuffer>((resolve, reject) => {
            // Callback form works on older Safari too
            a.ctx.decodeAudioData(data, resolve, reject);
          }),
      )
      .catch(() => {
        delete buffers[url];
        return null;
      });
  }
  return buffers[url];
}

export async function playClip(url: string, volume: number): Promise<void> {
  const a = getAudio();
  const buf = await loadClip(url);
  if (!a || !buf) throw new Error('Clip unavailable');
  const src = a.ctx.createBufferSource();
  const g = a.ctx.createGain();
  g.gain.value = volume;
  src.buffer = buf;
  src.connect(g).connect(a.out);
  src.start(a.ctx.currentTime + 0.01);
}
