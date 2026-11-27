import React, { useEffect, useRef } from 'react';

interface SpinningWheelProps {
  sections?: { section: string; color: string }[];
  /** Whether a spin may start right now. When false the wheel ignores drags. */
  canSpin?: boolean;
  /** Called when a drag is attempted while canSpin is false */
  onBlocked?: () => void;
  /**
   * Called when the user flicks the pointer. Ask the server for the result and
   * resolve with the index of the winning slice (or null to cancel).
   */
  onSpinStart?: () => Promise<number | null>;
  /** Called with the slice index once the pointer comes to rest */
  onSpin?: (sectionIndex: number) => void;
  sectionColors?: string[];
  sectionNumbers?: number[];
  className?: string;
}

const DEFAULT_COLORS = [
  "#FF0080", "#00FFFF", "#FFD700", "#FF00FF", "#00FF00", "#FF4500", "#9400D3", "#FFFF00", "#FF1493",
  "#00CED1", "#FF6347", "#7FFF00", "#FF69B4", "#00BFFF", "#FFA500", "#FF00FF", "#32CD32", "#FFB6C1",
];

function parseColor(color: string): [number, number, number] | null {
  if (!color || typeof color !== 'string') return null;
  if (color.startsWith('#')) {
    return [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)];
  }
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return match ? [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])] : null;
}

function lightenColor(color: string, percent: number): string {
  const rgb = parseColor(color);
  if (!rgb) return '#cccccc';
  const [r, g, b] = rgb.map((v) => Math.min(255, Math.floor(v + (255 - v) * (percent / 100))));
  return `rgb(${r}, ${g}, ${b})`;
}

function darkenColor(color: string, percent: number): string {
  const rgb = parseColor(color);
  if (!rgb) return '#666666';
  const [r, g, b] = rgb.map((v) => Math.max(0, Math.floor(v * (1 - percent / 100))));
  return `rgb(${r}, ${g}, ${b})`;
}

const TWO_PI = 2 * Math.PI;
const normalizeAngle = (a: number) => ((a % TWO_PI) + TWO_PI) % TWO_PI;

function vibrate(pattern: number | number[]) {
  try {
    window.navigator?.vibrate?.(pattern);
  } catch {
    /* not supported */
  }
}

export function SpinningWheel({
  sections = [],
  canSpin = true,
  onBlocked,
  onSpinStart,
  onSpin,
  sectionColors = DEFAULT_COLORS,
  sectionNumbers,
  className = '',
}: SpinningWheelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Pointer angle survives re-renders so the wheel doesn't jump.
  const angleRef = useRef(0);
  const busyRef = useRef(false);

  // Keep the latest props in refs so the canvas effect doesn't restart mid-spin.
  const propsRef = useRef({ canSpin, onBlocked, onSpinStart, onSpin });
  propsRef.current = { canSpin, onBlocked, onSpinStart, onSpin };

  const wheelSections = sections.length > 0
    ? sections
    : (sectionNumbers || Array.from({ length: 18 }, (_, i) => i + 1)).map((num, i) => ({
        section: num.toString(),
        color: sectionColors[i % sectionColors.length] || '#cccccc',
      }));
  const sectionsKey = JSON.stringify(wheelSections);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const list: { section: string; color: string }[] = JSON.parse(sectionsKey);
    const numSections = list.length;
    const sectionAngle = TWO_PI / numSections;

    let centerX = canvas.width / 2;
    let centerY = canvas.height / 2;
    let radius = Math.min(centerX, centerY) - 10;
    let pointerLength = radius * 0.9;
    const pointerWidth = 4;
    const pointerClickArea = 5;

    let isDragging = false;
    let dragOffset = 0;
    let lastTimestamp = 0;
    let animationId: number | null = null;
    let velocityBuffer: Array<{ angleDelta: number; timeDelta: number }> = [];
    let disposed = false;

    function drawWheel() {
      if (!ctx || !canvas) return;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const outerBorderGradient = ctx.createRadialGradient(centerX, centerY, radius - 5, centerX, centerY, radius + 5);
      outerBorderGradient.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
      outerBorderGradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.2)');
      outerBorderGradient.addColorStop(1, 'rgba(255, 255, 255, 0.8)');
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius + 4, 0, TWO_PI);
      ctx.strokeStyle = outerBorderGradient;
      ctx.lineWidth = 6;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(centerX, centerY, radius - 2, 0, TWO_PI);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 1;
      ctx.stroke();

      for (let i = 0; i < numSections; i++) {
        const start = i * sectionAngle;
        const end = (i + 1) * sectionAngle;
        const section = list[i];

        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
        gradient.addColorStop(0, lightenColor(section.color, 30));
        gradient.addColorStop(0.7, section.color);
        gradient.addColorStop(1, darkenColor(section.color, 15));

        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, start, end);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();

        const labelRadius = radius * 0.75;
        const labelAngle = start + sectionAngle / 2;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        ctx.fillStyle = 'white';
        ctx.font = 'bold 18px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(section.section, centerX + labelRadius * Math.cos(labelAngle), centerY + labelRadius * Math.sin(labelAngle));
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }
    }

    function drawPointer() {
      if (!ctx) return;
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(angleRef.current);

      const pointerGradient = ctx.createLinearGradient(0, -pointerWidth, 0, pointerWidth);
      pointerGradient.addColorStop(0, '#333');
      pointerGradient.addColorStop(0.5, '#000');
      pointerGradient.addColorStop(1, '#333');
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 5;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(pointerLength, 0);
      ctx.strokeStyle = pointerGradient;
      ctx.lineWidth = pointerWidth;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      const arrowSize = 14;
      ctx.beginPath();
      ctx.moveTo(pointerLength + 2, 0);
      ctx.lineTo(pointerLength - arrowSize, -arrowSize / 1.5);
      ctx.lineTo(pointerLength - arrowSize, arrowSize / 1.5);
      ctx.closePath();
      const arrowGradient = ctx.createLinearGradient(pointerLength - arrowSize, 0, pointerLength + 2, 0);
      arrowGradient.addColorStop(0, '#222');
      arrowGradient.addColorStop(1, '#000');
      ctx.fillStyle = arrowGradient;
      ctx.fill();
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 1;
      ctx.stroke();

      const knobGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 12);
      knobGradient.addColorStop(0, '#666');
      knobGradient.addColorStop(0.7, '#333');
      knobGradient.addColorStop(1, '#000');
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, TWO_PI);
      ctx.fillStyle = knobGradient;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, TWO_PI);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, TWO_PI);
      ctx.fillStyle = '#444';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    function render() {
      drawWheel();
      drawPointer();
    }

    function getEventPosition(event: MouseEvent | TouchEvent) {
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      let clientX: number;
      let clientY: number;
      if ('touches' in event) {
        const touch = event.touches[0] || event.changedTouches[0];
        if (!touch) return { x: 0, y: 0 };
        clientX = touch.clientX;
        clientY = touch.clientY;
      } else {
        clientX = event.clientX;
        clientY = event.clientY;
      }
      return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
    }

    const angleTo = (x: number, y: number) => Math.atan2(y - centerY, x - centerX);

    function isPointOnPointer(x: number, y: number): boolean {
      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let diff = Math.abs(normalizeAngle(Math.atan2(dy, dx)) - normalizeAngle(angleRef.current));
      if (diff > Math.PI) diff = TWO_PI - diff;
      const perpendicular = Math.sin(diff) * dist;
      const onLine = Math.abs(perpendicular) < pointerWidth * pointerClickArea && dist <= pointerLength + 10 && diff < Math.PI / 2;
      return onLine || dist < 20;
    }

    function handleStart(event: MouseEvent | TouchEvent) {
      const pos = getEventPosition(event);
      if (!isPointOnPointer(pos.x, pos.y)) return;
      event.preventDefault();
      if (busyRef.current) return;

      // Checked on every attempt, not just the first one.
      if (!propsRef.current.canSpin) {
        propsRef.current.onBlocked?.();
        return;
      }

      vibrate(15);
      isDragging = true;
      dragOffset = angleTo(pos.x, pos.y) - angleRef.current;
      lastTimestamp = performance.now();
      velocityBuffer = [];
    }

    function handleMove(event: MouseEvent | TouchEvent) {
      if (!isDragging) return;
      event.preventDefault();
      const pos = getEventPosition(event);
      const now = performance.now();
      const dt = now - lastTimestamp;
      if (dt <= 0) return;
      const newAngle = angleTo(pos.x, pos.y) - dragOffset;
      let delta = normalizeAngle(newAngle - angleRef.current);
      if (delta > Math.PI) delta -= TWO_PI;
      velocityBuffer.push({ angleDelta: delta, timeDelta: dt });
      if (velocityBuffer.length > 5) velocityBuffer.shift();
      angleRef.current = newAngle;
      lastTimestamp = now;
      render();
    }

    async function handleEnd(event: MouseEvent | TouchEvent) {
      if (!isDragging) return;
      event.preventDefault();
      isDragging = false;

      // Flick speed sets the direction and feel; the server sets where it lands.
      const totalDelta = velocityBuffer.reduce((s, v) => s + v.angleDelta, 0);
      const totalTime = velocityBuffer.reduce((s, v) => s + v.timeDelta, 0);
      velocityBuffer = [];
      const flick = totalTime > 0 ? (totalDelta / totalTime) * 16 : 0; // radians per frame
      const direction = flick < 0 ? -1 : 1;
      const speed = Math.min(0.6, Math.max(0.25, Math.abs(flick) * 1.5));

      busyRef.current = true;
      let target: number | null = null;
      let resolved = false;

      // Spin freely while waiting for the server's answer.
      const spinWhileWaiting = () => {
        if (disposed || resolved) return;
        angleRef.current += direction * speed;
        render();
        animationId = requestAnimationFrame(spinWhileWaiting);
      };
      animationId = requestAnimationFrame(spinWhileWaiting);

      try {
        target = (await propsRef.current.onSpinStart?.()) ?? null;
      } catch {
        target = null;
      }
      resolved = true;
      if (animationId !== null) cancelAnimationFrame(animationId);
      if (disposed) return;

      if (target === null || target < 0 || target >= numSections) {
        // No result: coast to a stop without reporting a slice.
        let v = speed;
        const coast = () => {
          v *= 0.94;
          angleRef.current += direction * v;
          render();
          if (v > 0.002 && !disposed) animationId = requestAnimationFrame(coast);
          else {
            animationId = null;
            busyRef.current = false;
          }
        };
        animationId = requestAnimationFrame(coast);
        return;
      }

      // Ease out onto a random spot inside the chosen slice.
      const landing = target * sectionAngle + sectionAngle * (0.2 + Math.random() * 0.6);
      const startAngle = angleRef.current;
      const current = normalizeAngle(startAngle);
      let distance = direction > 0 ? normalizeAngle(landing - current) : normalizeAngle(current - landing);
      const extraTurns = 3 + Math.floor(Math.random() * 2);
      distance += extraTurns * TWO_PI;
      // Cubic ease-out starts at 3x the average speed; match it to the current speed.
      const frames = Math.min(420, Math.max(180, (3 * distance) / speed));
      const duration = (frames / 60) * 1000;
      const t0 = performance.now();

      const finish = (now: number) => {
        if (disposed) return;
        const t = Math.min(1, (now - t0) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        angleRef.current = startAngle + direction * distance * eased;
        render();
        if (t < 1) {
          animationId = requestAnimationFrame(finish);
          return;
        }
        angleRef.current = normalizeAngle(angleRef.current);
        animationId = null;
        busyRef.current = false;
        vibrate([50, 20, 80]);
        const landed = Math.floor(normalizeAngle(angleRef.current) / sectionAngle) % numSections;
        propsRef.current.onSpin?.(landed);
      };
      animationId = requestAnimationFrame(finish);
    }

    function resizeCanvas() {
      if (!canvas || !canvas.parentElement) return;
      const size = Math.min(canvas.parentElement.clientWidth, canvas.parentElement.clientHeight, 300) || 300;
      canvas.width = size;
      canvas.height = size;
      centerX = size / 2;
      centerY = size / 2;
      radius = Math.min(centerX, centerY) - 10;
      pointerLength = radius * 0.9;
      render();
    }

    resizeCanvas();

    canvas.addEventListener('mousedown', handleStart);
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleEnd);
    canvas.addEventListener('touchstart', handleStart, { passive: false });
    document.addEventListener('touchmove', handleMove, { passive: false });
    document.addEventListener('touchend', handleEnd, { passive: false });
    window.addEventListener('resize', resizeCanvas);

    return () => {
      disposed = true;
      busyRef.current = false;
      canvas.removeEventListener('mousedown', handleStart);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleEnd);
      canvas.removeEventListener('touchstart', handleStart);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleEnd);
      window.removeEventListener('resize', resizeCanvas);
      if (animationId !== null) cancelAnimationFrame(animationId);
    };
  }, [sectionsKey]);

  return (
    <div className={`relative ${className}`} style={{ width: '300px', height: '300px', margin: '0 auto' }}>
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 shadow-lg" style={{ pointerEvents: 'none' }} />
      <div className="absolute inset-0 flex items-center justify-center" style={{ pointerEvents: 'none' }}>
        <div className="absolute w-[98%] h-[98%] rounded-full shadow-inner" />
      </div>
      <canvas
        ref={canvasRef}
        data-testid="spinner-canvas"
        className="absolute inset-0 z-10 rounded-full"
        style={{
          touchAction: 'none',
          width: '100%',
          height: '100%',
          cursor: canSpin ? 'grab' : 'not-allowed',
          boxShadow: 'inset 0 0 10px rgba(0,0,0,0.1), 0 4px 8px rgba(0,0,0,0.2), inset 0 2px 5px rgba(255,255,255,0.5), inset 0 -2px 5px rgba(0,0,0,0.2)',
        }}
      />
    </div>
  );
}

export default SpinningWheel;
