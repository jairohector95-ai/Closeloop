"use client";

import { useState } from "react";
import type { Tone } from "@/lib/types";
import { TONES, DEFAULT_SCHEDULE } from "@/lib/constants";
import { renderFollowUpEmail } from "@/lib/email/templates";
import { EmailPreview } from "@/components/app/EmailPreview";
import { cn } from "@/lib/utils/cn";

/** Live demo of the real template engine. Same code the product uses. */
export function SequenceDemo() {
  const [tone, setTone] = useState<Tone>("friendly");
  const [step, setStep] = useState(1);

  const email = renderFollowUpEmail({
    customerName: "Sarah Mitchell",
    businessName: "ABC Painting",
    ownerName: "Mike",
    serviceDescription: "Interior painting, 3 bedrooms",
    amount: 2850,
    quoteNumber: "EST-1041",
    sequenceNumber: step,
    sequenceLength: DEFAULT_SCHEDULE.length,
    tone,
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr] lg:gap-10">
      <div className="space-y-6">
        <div>
          <p className="mb-2 text-sm font-medium text-ink-800">Pick a tone</p>
          <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Tone">
            {TONES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={tone === t.id}
                onClick={() => setTone(t.id)}
                className={cn(
                  "rounded-xl border px-4 py-3 text-left transition-colors",
                  tone === t.id ? "border-ink-900 bg-ink-900 text-white" : "border-ink-200 bg-white hover:bg-ink-50",
                )}
              >
                <span className="block text-sm font-semibold">{t.label}</span>
                <span className={cn("block text-xs", tone === t.id ? "text-ink-300" : "text-ink-500")}>{t.description}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-ink-800">Which follow-up</p>
          <div className="flex gap-1.5">
            {DEFAULT_SCHEDULE.map((day, i) => (
              <button
                key={day}
                type="button"
                onClick={() => setStep(i + 1)}
                className={cn(
                  "flex-1 rounded-xl border px-3 py-2.5 text-center transition-colors",
                  step === i + 1 ? "border-ink-900 bg-white shadow-card" : "border-ink-200 bg-white text-ink-500 hover:bg-ink-50",
                )}
                aria-pressed={step === i + 1}
              >
                <span className="block text-sm font-semibold text-ink-900">#{i + 1}</span>
                <span className="block text-xs text-ink-500">Day {day}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <EmailPreview email={email} to="sarah.mitchell@example.com" from="Mike at ABC Painting" />
    </div>
  );
}
