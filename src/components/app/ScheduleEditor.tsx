"use client";

import { Plus, X } from "lucide-react";
import { MAX_FOLLOW_UPS } from "@/lib/constants";
import { addDays, formatShort, isValidISODate } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";

/**
 * Edits a list of "days after the quote was sent". Values are kept as strings
 * so the user can clear a box while typing; validation happens on submit.
 */
export function ScheduleEditor({
  value,
  onChange,
  sentAt,
  error,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  sentAt?: string;
  error?: string;
}) {
  const showDates = sentAt && isValidISODate(sentAt);

  return (
    <div className="space-y-2">
      <div className="space-y-2">
        {value.map((days, index) => (
          <div key={index} className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-sm font-medium text-ink-700">Follow-up #{index + 1}</span>
            <div className="relative w-28">
              <input
                type="number"
                min={1}
                max={90}
                inputMode="numeric"
                value={days}
                onChange={(e) => onChange(value.map((v, i) => (i === index ? e.target.value : v)))}
                className={cn(
                  "h-10 w-full rounded-xl border bg-white pl-3.5 pr-12 text-[15px] text-ink-900 focus:outline-none focus:ring-4 focus:ring-brand-100",
                  error ? "border-danger-600" : "border-ink-200 focus:border-brand-400",
                )}
                aria-label={`Days after quote for follow-up ${index + 1}`}
              />
              <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm text-ink-400">days</span>
            </div>
            <span className="hidden text-sm text-ink-500 sm:inline">
              {showDates && Number(days) > 0 ? formatShort(addDays(sentAt, Number(days))) : "after the quote"}
            </span>
            {value.length > 1 ? (
              <button
                type="button"
                onClick={() => onChange(value.filter((_, i) => i !== index))}
                className="ml-auto rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                aria-label={`Remove follow-up ${index + 1}`}
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {value.length < MAX_FOLLOW_UPS ? (
        <button
          type="button"
          onClick={() => {
            const last = Number(value[value.length - 1]) || 0;
            onChange([...value, String(last + 5)]);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-brand-700 hover:bg-brand-50"
        >
          <Plus className="h-4 w-4" />
          Add another follow-up
        </button>
      ) : null}
      {error ? (
        <p className="text-sm text-danger-600" role="alert">
          {error}
        </p>
      ) : (
        <p className="text-sm text-ink-500">Follow-ups stop automatically the moment the customer replies.</p>
      )}
    </div>
  );
}
