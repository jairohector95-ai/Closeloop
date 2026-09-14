"use client";

import type { Tone } from "@/lib/types";
import { TONES } from "@/lib/constants";
import { cn } from "@/lib/utils/cn";
import { Check } from "lucide-react";

export function TonePicker({ value, onChange, compact = false }: { value: Tone; onChange: (tone: Tone) => void; compact?: boolean }) {
  return (
    <div className={cn("grid gap-2", compact ? "grid-cols-3" : "sm:grid-cols-3")} role="radiogroup" aria-label="Email tone">
      {TONES.map((tone) => {
        const selected = tone.id === value;
        return (
          <button
            key={tone.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(tone.id)}
            className={cn(
              "flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-left transition-colors",
              selected ? "border-ink-900 bg-ink-900 text-white" : "border-ink-200 bg-white text-ink-800 hover:border-ink-300 hover:bg-ink-50",
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                selected ? "border-white bg-white text-ink-900" : "border-ink-300",
              )}
            >
              {selected ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
            </span>
            <span>
              <span className="block text-sm font-semibold">{tone.label}</span>
              {!compact ? <span className={cn("mt-0.5 block text-xs", selected ? "text-ink-300" : "text-ink-500")}>{tone.description}</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
