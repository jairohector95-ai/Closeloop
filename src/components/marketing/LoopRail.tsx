import { Check, Mail, FileText } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * The signature motif: a follow-up sequence drawn as a rail that closes on a
 * reply. Reused in the hero and the how-it-works section.
 */
export function LoopRail({ className, compact = false }: { className?: string; compact?: boolean }) {
  const steps = [
    { day: "Day 0", label: "Quote sent", icon: FileText, state: "done" as const },
    { day: "Day 2", label: "Follow-up #1", icon: Mail, state: "done" as const },
    { day: "Day 5", label: "Follow-up #2", icon: Mail, state: "next" as const },
    { day: "Day 10", label: "Follow-up #3", icon: Mail, state: "future" as const },
  ];
  return (
    <ol className={cn("relative", className)} aria-label="Example follow-up sequence">
      <span className="absolute bottom-4 left-[15px] top-4 w-px bg-ink-200" aria-hidden="true" />
      {steps.map((s) => (
        <li key={s.day} className={cn("relative flex items-center gap-3.5", compact ? "py-1.5" : "py-2")}>
          <span
            className={cn(
              "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white",
              s.state === "done" && "bg-ink-900 text-white",
              s.state === "next" && "loop-pulse border-2 border-brand-500 bg-white text-brand-600",
              s.state === "future" && "border-2 border-dashed border-ink-300 bg-white text-ink-400",
            )}
          >
            {s.state === "done" ? <Check className="h-4 w-4" strokeWidth={2.5} /> : <s.icon className="h-3.5 w-3.5" />}
          </span>
          <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
            <span className={cn("text-sm font-medium", s.state === "future" ? "text-ink-400" : "text-ink-900")}>{s.label}</span>
            <span className="text-xs tabular-nums text-ink-400">{s.day}</span>
          </div>
        </li>
      ))}
      <li className="relative mt-1 flex items-center gap-3.5 py-2">
        <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success-600 text-white ring-4 ring-white">
          <Check className="h-4 w-4" strokeWidth={2.5} />
        </span>
        <div className="rounded-lg bg-success-50 px-3 py-1.5 text-sm font-medium text-success-700">Customer replied · sequence stopped</div>
      </li>
    </ol>
  );
}
