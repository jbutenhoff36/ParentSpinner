import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

export type WheelSlice = { label: string; color: string; textColor: string };

export interface PrizeWheelHandle {
  /** Start a spin (same as tapping the wheel). */
  spin: () => void;
}

interface PrizeWheelProps {
  slices: WheelSlice[];
  canSpin: boolean;
  /** Called when someone tries to spin while canSpin is false */
  onBlocked?: () => void;
  /** Ask the server for the result; resolve with the winning slice index, or null to cancel. */
  onSpinStart: () => Promise<number | null>;
  /** Called once the wheel stops on the winning slice */
  onSpinEnd: (index: number) => void;
  /** Accessible description of the wheel */
  ariaLabel: string;
}

const TWO_PI = Math.PI * 2;
const norm = (a: number) => ((a % TWO_PI) + TWO_PI) % TWO_PI;
const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported */
  }
}

/**
 * A wheel that turns under a fixed pointer at the top. Tap or swipe anywhere on it
 * (or use the Spin button via the ref) to spin. The landing slice always comes from
 * onSpinStart (the server); the animation just gets there.
 */
export const PrizeWheel = forwardRef<PrizeWheelHandle, PrizeWheelProps>(function PrizeWheel(
  { slices, canSpin, onBlocked, onSpinStart, onSpinEnd, ariaLabel },
  ref,
) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotationRef = useRef(0);
  const busyRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  const [size, setSize] = useState(300);

  const latest = useRef({ canSpin, onBlocked, onSpinStart, onSpinEnd, slices });
  latest.current = { canSpin, onBlocked, onSpinStart, onSpinEnd, slices };

  // Size to the container, up to 360px
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setSize(Math.max(220, Math.min(360, Math.floor(el.clientWidth))));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const px = Math.round(size * dpr);
    if (canvas.width !== px) {
      canvas.width = px;
      canvas.height = px;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const list = latest.current.slices;
    const n = Math.max(1, list.length);
    const arc = TWO_PI / n;
    const c = size / 2;
    const r = c - 6;

    // Rim
    ctx.beginPath();
    ctx.arc(c, c, r + 4, 0, TWO_PI);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#e2e8f0';
    ctx.stroke();

    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(rotationRef.current - Math.PI / 2);

    const fontSize = n > 14 ? 11 : n > 10 ? 12.5 : 14;
    ctx.font = `600 ${fontSize}px Nunito, system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    const maxText = r * 0.68;

    for (let i = 0; i < n; i++) {
      const s = list[i] || { label: '', color: '#e5e7eb', textColor: '#1f2937' };
      const start = i * arc;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, start, start + arc);
      ctx.closePath();
      ctx.fillStyle = s.color;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.stroke();

      // Label along the slice's middle, reading outward-in from the rim
      ctx.save();
      const mid = start + arc / 2;
      ctx.rotate(mid);
      ctx.fillStyle = s.textColor;
      let text = s.label;
      if (ctx.measureText(text).width > maxText) {
        while (text.length > 1 && ctx.measureText(text + '…').width > maxText) text = text.slice(0, -1);
        text = text.trimEnd() + '…';
      }
      // Keep labels upright: flip the ones on the left half of the screen
      const screenAngle = norm(mid + rotationRef.current - Math.PI / 2);
      if (screenAngle > Math.PI / 2 && screenAngle < (3 * Math.PI) / 2) {
        ctx.rotate(Math.PI);
        ctx.textAlign = 'left';
        ctx.fillText(text, -(r - 10), 0);
        ctx.textAlign = 'right';
      } else {
        ctx.fillText(text, r - 10, 0);
      }
      ctx.restore();
    }
    ctx.restore();

    // Hub
    ctx.beginPath();
    ctx.arc(c, c, r * 0.13, 0, TWO_PI);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#cbd5e1';
    ctx.stroke();
  }, [size]);

  useEffect(() => {
    draw();
  }, [draw, slices]);

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  const spin = useCallback(async () => {
    if (busyRef.current) return;
    if (!latest.current.canSpin) {
      latest.current.onBlocked?.();
      return;
    }
    busyRef.current = true;
    vibrate(15);
    const reduced = prefersReducedMotion();

    // Turn steadily while the server picks the result
    let waiting = true;
    const idleSpeed = reduced ? 0 : 0.22;
    const idle = () => {
      if (!waiting) return;
      rotationRef.current += idleSpeed;
      draw();
      frameRef.current = requestAnimationFrame(idle);
    };
    frameRef.current = requestAnimationFrame(idle);

    let target: number | null = null;
    try {
      target = await latest.current.onSpinStart();
    } catch {
      target = null;
    }
    waiting = false;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);

    const n = latest.current.slices.length;
    if (target === null || target < 0 || target >= n) {
      busyRef.current = false;
      draw();
      return;
    }

    // Land at a random spot inside the target slice, under the top pointer.
    const arc = TWO_PI / n;
    const local = target * arc + arc * (0.15 + Math.random() * 0.7);
    const start = rotationRef.current;
    const turns = reduced ? 0 : 4 + Math.floor(Math.random() * 2);
    const distance = norm(-local - start) + turns * TWO_PI;
    const duration = reduced ? 400 : 4200;
    const t0 = performance.now();

    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      rotationRef.current = start + distance * eased;
      draw();
      if (t < 1) {
        frameRef.current = requestAnimationFrame(step);
        return;
      }
      frameRef.current = null;
      rotationRef.current = norm(rotationRef.current);
      busyRef.current = false;
      vibrate([40, 30, 60]);
      latest.current.onSpinEnd(target as number);
    };
    frameRef.current = requestAnimationFrame(step);
  }, [draw]);

  useImperativeHandle(ref, () => ({ spin }), [spin]);

  // Tap or swipe anywhere on the wheel
  const downRef = useRef<{ x: number; y: number } | null>(null);

  return (
    <div ref={wrapRef} className="relative w-full max-w-[360px] mx-auto select-none">
      {/* Fixed pointer at the top */}
      <svg
        className="absolute left-1/2 -translate-x-1/2 -top-1 z-10 drop-shadow"
        width="28"
        height="34"
        viewBox="0 0 28 34"
        aria-hidden="true"
      >
        <path d="M14 34 L2 6 Q14 -2 26 6 Z" fill="#1e293b" />
        <circle cx="14" cy="10" r="4" fill="#ffffff" />
      </svg>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={ariaLabel}
        data-testid="spinner-canvas"
        style={{ width: size, height: size, touchAction: 'none', cursor: canSpin ? 'pointer' : 'not-allowed' }}
        className="block mx-auto rounded-full"
        onPointerDown={(e) => {
          downRef.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={(e) => {
          if (!downRef.current) return;
          downRef.current = null;
          e.preventDefault();
          spin();
        }}
        onPointerCancel={() => {
          downRef.current = null;
        }}
      />
    </div>
  );
});

export default PrizeWheel;
