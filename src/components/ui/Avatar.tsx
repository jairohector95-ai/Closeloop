import { initials } from "@/lib/utils/text";
import { cn } from "@/lib/utils/cn";

const palettes = ["bg-brand-50 text-brand-700", "bg-success-50 text-success-700", "bg-warning-50 text-warning-700", "bg-ink-100 text-ink-700"];

export function Avatar({ name, className }: { name: string; className?: string }) {
  const palette = palettes[name.length % palettes.length];
  return (
    <span className={cn("inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold", palette, className)} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
