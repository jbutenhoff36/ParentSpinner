import { cn } from "@/lib/utils";

/** A little prize wheel: the app's logo. */
export function BrandMark({ className }: { className?: string }) {
  const colors = ["#FBBF24", "#FB7185", "#A78BFA", "#38BDF8", "#34D399", "#F97316"];
  const r = 26;
  const slices = colors.map((c, i) => {
    const a0 = (i / 6) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 1) / 6) * Math.PI * 2 - Math.PI / 2;
    const p = (a: number) => `${32 + r * Math.cos(a)} ${34 + r * Math.sin(a)}`;
    return <path key={i} d={`M32 34 L${p(a0)} A${r} ${r} 0 0 1 ${p(a1)} Z`} fill={c} />;
  });
  return (
    <svg viewBox="0 0 64 64" className={cn("h-9 w-9", className)} aria-hidden="true">
      <circle cx="32" cy="34" r="29" fill="#fff" />
      {slices}
      <circle cx="32" cy="34" r="7" fill="#fff" />
      <circle cx="32" cy="34" r="3" fill="#6D4AFF" />
      <path d="M32 14 L25 2 Q32 -1 39 2 Z" fill="#1E1B4B" />
    </svg>
  );
}
