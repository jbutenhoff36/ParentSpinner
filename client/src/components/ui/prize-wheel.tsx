import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

export type WheelSlice = { label: string; color: string; textColor: string };

export interface PrizeWheelHandle {
  /** Flick the arrow with a random strong spin (same as a good swipe). */
  spin: () => void;
}

interface PrizeWheelProps {
  slices: WheelSlice[];
  canSpin: boolean;
  /** Called when someone tries to spin while canSpin is false */
  onBlocked?: () => void;
  /** Ask the server for the result; resolve with the winning slice index, or null to cancel. */
  onSpinStart: () => Promise<number | null>;
  /** Called once the arrow stops on the winning slice */
  onSpinEnd: (index: number) => void;
  /** Called when a swipe was too gentle to count as a spin */
  onWeakSwipe?: () => void;
  /** Called each time the arrow passes a slice edge (for the tick sound) */
  onTick?: () => void;
  /** Accessible description of the wheel */
  ariaLabel: string;
}

const TWO_PI = Math.PI * 2;
/** Near-black indigo used for the rim, dividers, hub and arrow */
const INK = '#1A1733';
/** Lighten (amt > 0) or darken (amt < 0) a #rrggbb colour. */
function shadeHex(hex: string, amt: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (v: number) => Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt));
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
  return `rgb(${r},${g},${b})`;
}
const norm = (a: number) => ((a % TWO_PI) + TWO_PI) % TWO_PI;
const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// ---- Physics ----
// The arrow slows the way a real spinner does: a steady friction (it always stops)
// plus a drag that grows with speed (fast spins shed speed quicker at first).
const FRICTION = 2.4; // rad/s²
const DRAG = 0.32; // 1/s
/** Slowest release (rad/s) that counts as a spin. About 1¼ turns of travel. */
const MIN_SPIN_SPEED = 5.5;
const MAX_SPIN_SPEED = 42;
const STEP = 1 / 240;

/** One integration step. m scales friction (used to land on the chosen slice). */
function stepSpeed(w: number, m: number, dt: number) {
  const dec = m * (FRICTION + DRAG * w);
  return Math.max(0, w - dec * dt);
}
/** How far (radians) the arrow coasts from speed w with friction multiplier m. */
function coastDistance(w: number, m: number) {
  let d = 0;
  for (let i = 0; i < 20000 && w > 0; i++) {
    const nw = stepSpeed(w, m, STEP);
    d += ((w + nw) / 2) * STEP;
    w = nw;
  }
  return d;
}
/** Friction multiplier that makes speed w coast exactly distance d. */
function solveFriction(w: number, d: number) {
  let lo = 0.05, hi = 20;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (coastDistance(w, mid) > d) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported */
  }
}

/**
 * A fixed wheel with a big arrow in the middle. Grab the arrow (or anywhere on the
 * wheel) and swipe: it spins at the speed of your swipe and slows down with friction.
 * The winning slice always comes from onSpinStart (the server); once it is known, the
 * friction is nudged a few percent so the arrow coasts to a stop inside that slice.
 */
export const PrizeWheel = forwardRef<PrizeWheelHandle, PrizeWheelProps>(function PrizeWheel(
  { slices, canSpin, onBlocked, onSpinStart, onSpinEnd, onWeakSwipe, onTick, ariaLabel },
  ref,
) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wheelCache = useRef<HTMLCanvasElement | null>(null);
  const angleRef = useRef(0); // arrow angle, clockwise from straight up
  const busyRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  const edgeRef = useRef(-1);
  const [size, setSize] = useState(300);
  const [dragging, setDragging] = useState(false);

  const latest = useRef({ canSpin, onBlocked, onSpinStart, onSpinEnd, onWeakSwipe, onTick, slices });
  latest.current = { canSpin, onBlocked, onSpinStart, onSpinEnd, onWeakSwipe, onTick, slices };

  // Size to the container, up to 380px
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setSize(Math.max(220, Math.min(380, Math.floor(el.clientWidth))));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geometry = useCallback(() => {
    const c = size / 2;
    const R = c - 2; // outer edge of the dark rim
    const rimW = Math.max(12, Math.round(size * 0.05));
    const r = R - rimW - 2; // slices
    return { c, R, rimW, r };
  }, [size]);

  /** Paint the (still) wheel once into an offscreen canvas. */
  const paintWheel = useCallback(() => {
    const dpr = window.devicePixelRatio || 1;
    const px = Math.round(size * dpr);
    const cv = wheelCache.current || document.createElement('canvas');
    wheelCache.current = cv;
    cv.width = px;
    cv.height = px;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const list = latest.current.slices;
    const n = Math.max(1, list.length);
    const arc = TWO_PI / n;
    const { c, R, rimW, r } = geometry();
    const rot = -Math.PI / 2; // slice 0 starts at the top and runs clockwise

    // Dark rim with a soft top-to-bottom sheen so it reads as a solid ring
    const rimGrad = ctx.createLinearGradient(0, 0, 0, size);
    rimGrad.addColorStop(0, '#4B3F9A');
    rimGrad.addColorStop(0.45, '#221C4A');
    rimGrad.addColorStop(1, '#0B0918');
    ctx.beginPath();
    ctx.arc(c, c, R, 0, TWO_PI);
    ctx.fillStyle = rimGrad;
    ctx.fill();

    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(rot);

    for (let i = 0; i < n; i++) {
      const s = list[i] || { label: '', color: '#e5e7eb', textColor: '#1f2937' };
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, i * arc, (i + 1) * arc);
      ctx.closePath();
      // Each slice glows a little lighter toward the middle, like glossy candy
      const g = ctx.createRadialGradient(0, 0, r * 0.12, 0, 0, r);
      g.addColorStop(0, shadeHex(s.color, 0.38));
      g.addColorStop(0.55, s.color);
      g.addColorStop(1, shadeHex(s.color, -0.1));
      ctx.fillStyle = g;
      ctx.fill();
    }

    // Depth: slices darken a little toward the rim
    const shade = ctx.createRadialGradient(0, 0, r * 0.25, 0, 0, r);
    shade.addColorStop(0, 'rgba(255,255,255,0)');
    shade.addColorStop(0.82, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(20,16,50,0.22)');
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TWO_PI);
    ctx.fillStyle = shade;
    ctx.fill();

    // Bold dark dividers between slices
    if (n > 1) {
      ctx.lineCap = 'round';
      const lw = Math.max(2, size * 0.0075);
      for (const [color, width] of [['rgba(26,23,51,0.85)', lw], ['rgba(255,255,255,0.55)', lw * 0.35]] as const) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        for (let i = 0; i < n; i++) {
          const ang = i * arc;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
          ctx.stroke();
        }
      }
    }

    // Labels along each slice's middle, from the rim inward, kept upright
    const fontSize = n > 14 ? 11 : n > 10 ? 12.5 : 14.5;
    ctx.font = `800 ${fontSize}px "Plus Jakarta Sans Variable", system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    const maxText = r * 0.6;
    for (let i = 0; i < n; i++) {
      const s = list[i] || { label: '', color: '#e5e7eb', textColor: '#1f2937' };
      ctx.save();
      const mid = i * arc + arc / 2;
      ctx.rotate(mid);
      ctx.fillStyle = s.textColor;
      ctx.shadowColor = 'rgba(255,255,255,0.55)';
      ctx.shadowBlur = 3;
      let text = s.label;
      if (ctx.measureText(text).width > maxText) {
        while (text.length > 1 && ctx.measureText(text + '…').width > maxText) text = text.slice(0, -1);
        text = text.trimEnd() + '…';
      }
      const screenAngle = norm(mid + rot);
      if (screenAngle > Math.PI / 2 && screenAngle < (3 * Math.PI) / 2) {
        ctx.rotate(Math.PI);
        ctx.textAlign = 'left';
        ctx.fillText(text, -(r - 12), 0);
      } else {
        ctx.textAlign = 'right';
        ctx.fillText(text, r - 12, 0);
      }
      ctx.restore();
    }

    // Crisp white line between the slices and the dark rim
    ctx.shadowColor = 'transparent';
    ctx.beginPath();
    ctx.arc(0, 0, r + 1.5, 0, TWO_PI);
    ctx.lineWidth = 4;
    const gold = ctx.createLinearGradient(0, -r, 0, r);
    gold.addColorStop(0, '#FFE9A8');
    gold.addColorStop(0.5, '#F5B83D');
    gold.addColorStop(1, '#C9851A');
    ctx.strokeStyle = gold;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, r - 1, 0, TWO_PI);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.stroke();

    // Rim lights: white at every slice edge, gold between
    const pegR = R - rimW / 2 - 1;
    const lights = n < 10 ? n * 2 : n;
    for (let i = 0; i < lights; i++) {
      const ang = (i * TWO_PI) / lights;
      const peg = lights === n || i % 2 === 0;
      const bx = Math.cos(ang) * pegR, by = Math.sin(ang) * pegR;
      const br = peg ? rimW * 0.26 : rimW * 0.17;
      const bulb = ctx.createRadialGradient(bx - br * 0.3, by - br * 0.3, 0, bx, by, br);
      bulb.addColorStop(0, '#ffffff');
      bulb.addColorStop(1, peg ? '#FFF1C9' : '#FFC23D');
      ctx.shadowColor = peg ? 'rgba(255,240,200,0.9)' : 'rgba(255,190,60,0.9)';
      ctx.shadowBlur = rimW * 0.5;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, TWO_PI);
      ctx.fillStyle = bulb;
      ctx.fill();
    }
    ctx.shadowColor = 'transparent';
    ctx.restore();
  }, [size, geometry]);

  /** Draw the cached wheel plus the arrow at its current angle. */
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
    if (!wheelCache.current || wheelCache.current.width !== px) paintWheel();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, px, px);
    if (wheelCache.current) ctx.drawImage(wheelCache.current, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const { c, r } = geometry();
    const L = r * 0.62; // tip distance from center (short enough to leave most labels readable)
    const tail = r * 0.24;
    const head = Math.max(26, r * 0.22);
    const headW = Math.max(14, r * 0.11);
    const shaftW = Math.max(5, r * 0.045);

    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(angleRef.current);
    ctx.shadowColor = 'rgba(10,8,30,0.45)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    ctx.beginPath();
    ctx.moveTo(0, -L); // tip
    ctx.lineTo(headW, -L + head);
    ctx.lineTo(shaftW, -L + head * 0.82);
    ctx.lineTo(shaftW * 1.6, tail);
    ctx.quadraticCurveTo(0, tail + shaftW * 3.2, -shaftW * 1.6, tail);
    ctx.lineTo(-shaftW, -L + head * 0.82);
    ctx.lineTo(-headW, -L + head);
    ctx.closePath();
    const arrowGrad = ctx.createLinearGradient(-headW, 0, headW, 0);
    arrowGrad.addColorStop(0, '#3B3380');
    arrowGrad.addColorStop(0.5, INK);
    arrowGrad.addColorStop(1, '#0B0918');
    ctx.fillStyle = arrowGrad;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.restore();

    // Hub on top of the arrow: dark button, white ring, bright center
    const hubR = Math.max(20, r * 0.15);
    ctx.beginPath();
    ctx.arc(c, c, hubR, 0, TWO_PI);
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.lineWidth = 3.5;
    const hubRing = ctx.createLinearGradient(c, c - hubR, c, c + hubR);
    hubRing.addColorStop(0, '#FFE9A8');
    hubRing.addColorStop(1, '#C9851A');
    ctx.strokeStyle = hubRing;
    ctx.stroke();
    const core = ctx.createRadialGradient(c - hubR * 0.2, c - hubR * 0.25, 1, c, c, hubR * 0.55);
    core.addColorStop(0, '#A48BFF');
    core.addColorStop(1, '#6D4AFF');
    ctx.beginPath();
    ctx.arc(c, c, hubR * 0.52, 0, TWO_PI);
    ctx.fillStyle = core;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c - hubR * 0.16, c - hubR * 0.18, hubR * 0.13, 0, TWO_PI);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fill();
  }, [size, geometry, paintWheel]);

  // Repaint the wheel when the slices or size change
  const sliceKey = slices.map((s) => `${s.label}|${s.color}|${s.textColor}`).join('~');
  useEffect(() => {
    paintWheel();
    draw();
  }, [paintWheel, draw, sliceKey]);

  // Repaint once the web font has loaded so labels use it
  useEffect(() => {
    document.fonts?.ready.then(() => { paintWheel(); draw(); }).catch(() => {});
  }, [paintWheel, draw]);

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  /** Tick whenever the arrow crosses into a new slice. */
  const checkTick = useCallback(() => {
    const n = latest.current.slices.length;
    if (n < 2) return;
    const idx = Math.floor(norm(angleRef.current) / (TWO_PI / n));
    if (idx === edgeRef.current) return;
    edgeRef.current = idx;
    latest.current.onTick?.();
  }, []);

  /** Coast from speed w (signed rad/s). Asks the server for the result unless `free`. */
  const launch = useCallback(async (w0: number, free = false) => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    const dir = Math.sign(w0) || 1;
    let w = Math.min(MAX_SPIN_SPEED, Math.abs(w0));
    let m = 1;
    let goal: number | null = null; // remaining distance once the target is known
    let travelled = 0;
    let last = performance.now();
    let resolveDone: () => void = () => {};
    const done = new Promise<void>((res) => (resolveDone = res));

    const frame = (now: number) => {
      let dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      while (dt > 0 && w > 0) {
        const h = Math.min(STEP, dt);
        const nw = stepSpeed(w, m, h);
        const move = ((w + nw) / 2) * h;
        travelled += move;
        angleRef.current += dir * move;
        w = nw;
        dt -= h;
      }
      checkTick();
      draw();
      if (w > 0) {
        frameRef.current = requestAnimationFrame(frame);
      } else {
        frameRef.current = null;
        if (goal !== null) angleRef.current = goalAngle; // settle rounding error
        angleRef.current = norm(angleRef.current);
        draw();
        resolveDone();
      }
    };
    let goalAngle = 0;
    frameRef.current = requestAnimationFrame(frame);

    if (free) {
      await done;
      busyRef.current = false;
      return;
    }

    let target: number | null = null;
    try {
      target = await latest.current.onSpinStart();
    } catch {
      target = null;
    }
    const n = latest.current.slices.length;
    if (target === null || target < 0 || target >= n) {
      await done; // let it coast to a natural stop, but no result
      busyRef.current = false;
      return;
    }

    if (w > 0) {
      // Pick a random spot in the winning slice, then the number of extra turns that
      // is closest to where friction would have stopped it anyway.
      const arc = TWO_PI / n;
      const spot = target * arc + arc * (0.15 + Math.random() * 0.7);
      const here = norm(angleRef.current);
      const base = dir > 0 ? norm(spot - here) : norm(here - spot);
      const natural = coastDistance(w, 1);
      let best = base;
      for (let k = 0; k < 40; k++) {
        const d = base + k * TWO_PI;
        if (Math.abs(d - natural) < Math.abs(best - natural)) best = d;
        if (d > natural) break;
      }
      if (best < 0.3) best += TWO_PI; // never stop dead the instant the answer arrives
      m = solveFriction(w, best);
      goal = best;
      goalAngle = angleRef.current + dir * best;
    } else {
      // Rare: the server took longer than the whole spin. Glide on to the slice.
      const arc = TWO_PI / n;
      const spot = target * arc + arc * 0.5;
      const dist = norm(spot - norm(angleRef.current)) + TWO_PI;
      w = 4;
      m = solveFriction(w, dist);
      goal = dist;
      goalAngle = angleRef.current + dist;
      last = performance.now();
      frameRef.current = requestAnimationFrame(frame);
    }
    await done;
    busyRef.current = false;
    vibrate([40, 30, 60]);
    latest.current.onSpinEnd(target);
  }, [draw, checkTick]);

  const spin = useCallback(() => {
    if (busyRef.current) return;
    if (!latest.current.canSpin) {
      latest.current.onBlocked?.();
      return;
    }
    busyRef.current = true;
    vibrate(15);
    const reduced = prefersReducedMotion();
    launch(reduced ? 7 : 16 + Math.random() * 10);
  }, [launch]);

  useImperativeHandle(ref, () => ({ spin }), [spin]);

  // ---- Swipe handling ----
  // While the finger is down the arrow follows it around the center. On release, its
  // speed over the last ~80ms becomes the spin speed.
  const drag = useRef<{ id: number; startX: number; startY: number; prev: number; samples: { t: number; a: number }[]; moved: boolean } | null>(null);

  const pointerAngle = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    return Math.atan2(dx, -dy); // clockwise from straight up
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (busyRef.current) return;
    if (!latest.current.canSpin) {
      latest.current.onBlocked?.();
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    const a = pointerAngle(e);
    drag.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, prev: a, samples: [{ t: performance.now(), a: angleRef.current }], moved: false };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 6) return;
    d.moved = true;
    const a = pointerAngle(e);
    let delta = a - d.prev;
    if (delta > Math.PI) delta -= TWO_PI;
    if (delta < -Math.PI) delta += TWO_PI;
    d.prev = a;
    angleRef.current += delta;
    const now = performance.now();
    d.samples.push({ t: now, a: angleRef.current });
    while (d.samples.length > 2 && now - d.samples[0].t > 100) d.samples.shift();
    checkTick();
    draw();
  };

  const endDrag = (e: React.PointerEvent<HTMLCanvasElement>, cancelled = false) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (cancelled) return;
    const now = performance.now();
    const recent = d.samples.filter((s) => now - s.t <= 100);
    const first = recent[0] || d.samples[0];
    const lastS = d.samples[d.samples.length - 1];
    const span = Math.max(0.016, (lastS.t - first.t) / 1000);
    // A finger that stopped before lifting has no speed left
    const stale = now - lastS.t > 60;
    const w = stale ? 0 : (lastS.a - first.a) / span;

    if (!d.moved) {
      latest.current.onWeakSwipe?.();
      return;
    }
    if (Math.abs(w) < MIN_SPIN_SPEED) {
      // Too gentle to count: let it drift and settle, then hint
      busyRef.current = true;
      if (Math.abs(w) > 0.3) launch(w, true).then(() => latest.current.onWeakSwipe?.());
      else {
        busyRef.current = false;
        latest.current.onWeakSwipe?.();
      }
      return;
    }
    if (!latest.current.canSpin) {
      latest.current.onBlocked?.();
      return;
    }
    busyRef.current = true;
    vibrate(15);
    launch(w);
  };

  return (
    <div ref={wrapRef} className="relative w-full max-w-[380px] mx-auto select-none">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={ariaLabel}
        data-testid="spinner-canvas"
        style={{
          width: size,
          height: size,
          touchAction: 'none',
          cursor: canSpin ? (dragging ? 'grabbing' : 'grab') : 'not-allowed',
        }}
        className="block mx-auto rounded-full shadow-[0_22px_45px_-16px_rgba(12,10,35,0.6)]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endDrag(e)}
        onPointerCancel={(e) => endDrag(e, true)}
      />
    </div>
  );
});

export default PrizeWheel;
