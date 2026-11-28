import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemeChoice } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Auto", icon: Monitor },
];

/** Light / Dark / Auto switch. Auto follows the phone or computer setting. */
export function ThemeToggle({ className, compact }: { className?: string; compact?: boolean }) {
  const [theme, setTheme] = useTheme();
  return (
    <div className={cn("flex gap-1 rounded-xl bg-muted p-1", className)} role="radiogroup" aria-label="Appearance">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={theme === o.value}
          aria-label={compact ? o.label : undefined}
          title={o.value === "system" ? "Match my device" : o.label}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setTheme(o.value);
          }}
          data-testid={`theme-${o.value}`}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors",
            theme === o.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <o.icon className="h-3.5 w-3.5" aria-hidden="true" />
          {!compact && o.label}
        </button>
      ))}
    </div>
  );
}
