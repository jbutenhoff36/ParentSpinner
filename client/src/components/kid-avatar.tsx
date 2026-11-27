import { cn } from "@/lib/utils";

const TINTS = [
  "bg-amber-200 text-amber-900", "bg-rose-200 text-rose-900", "bg-violet-200 text-violet-900",
  "bg-sky-200 text-sky-900", "bg-emerald-200 text-emerald-900", "bg-orange-200 text-orange-900",
];

export function KidAvatar({ name, avatar, className }: { name: string; avatar?: string | null; className?: string }) {
  if (avatar) {
    return <img src={avatar} alt="" className={cn("h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-card", className)} />;
  }
  const tint = TINTS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % TINTS.length];
  return (
    <span aria-hidden="true" className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold ring-2 ring-card", tint, className)}>
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
