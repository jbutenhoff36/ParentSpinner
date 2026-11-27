import { cn } from "@/lib/utils";

interface FamilyStarLogoProps {
  className?: string;
}

export function FamilyStarLogo({ className }: FamilyStarLogoProps) {
  return (
    <div className={cn("relative", className)}>
      <svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M32 4L38.472 24.944L60 24.944L42.764 37.112L49.236 58.056L32 45.888L14.764 58.056L21.236 37.112L4 24.944L25.528 24.944L32 4Z"
          fill="url(#gradient1)"
          className="drop-shadow-sm"
        />
        <circle cx="32" cy="22" r="3" fill="#fff" opacity="0.9" />
        <circle cx="25" cy="30" r="2.5" fill="#fff" opacity="0.8" />
        <circle cx="39" cy="30" r="2.5" fill="#fff" opacity="0.8" />
        <circle cx="32" cy="38" r="2" fill="#fff" opacity="0.7" />
        <path d="M32 22L25 30M32 22L39 30M25 30L32 38M39 30L32 38" stroke="#fff" strokeWidth="1" opacity="0.6" />
        <defs>
          <linearGradient id="gradient1" x1="32" y1="4" x2="32" y2="58.056" gradientUnits="userSpaceOnUse">
            <stop stopColor="#6366f1" />
            <stop offset="0.5" stopColor="#8b5cf6" />
            <stop offset="1" stopColor="#a855f7" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
