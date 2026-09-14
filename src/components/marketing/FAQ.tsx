"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const ITEMS: { q: string; a: string }[] = [
  {
    q: "Will this annoy my customers?",
    a: "No. The default is three short, polite emails spread over ten days, and the sequence stops the moment they reply. Most customers appreciate a reminder about something they asked for.",
  },
  {
    q: "What happens when the customer replies?",
    a: "Mark the quote as replied (one click) and every remaining follow-up is cancelled. In a later phase CloseLoop will detect replies in your inbox and stop by itself.",
  },
  {
    q: "Can I change what the emails say?",
    a: "You choose the tone (friendly, professional or direct) and CloseLoop writes the emails from your business name, your name and the job description. Fully custom templates are on the roadmap.",
  },
  {
    q: "Do I have to change how I send estimates?",
    a: "No. Keep sending quotes the way you do today. Just add the quote to CloseLoop once it's out the door.",
  },
  {
    q: "What if I want to hold off on a customer for a while?",
    a: "Pause the quote. Nothing goes out until you resume, and the remaining follow-ups pick up with their original spacing.",
  },
  {
    q: "How much does it cost?",
    a: "Start free. Paid plans start at $19/month once you're following up on more than a handful of quotes at once.",
  },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <dl className="divide-y divide-ink-200 border-y border-ink-200">
      {ITEMS.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q}>
            <dt>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-4 py-5 text-left"
                aria-expanded={isOpen}
              >
                <span className="text-[15px] font-medium text-ink-900 sm:text-base">{item.q}</span>
                <ChevronDown className={cn("h-5 w-5 shrink-0 text-ink-400 transition-transform", isOpen && "rotate-180")} />
              </button>
            </dt>
            {isOpen ? <dd className="rise pb-5 text-[15px] leading-relaxed text-ink-600">{item.a}</dd> : null}
          </div>
        );
      })}
    </dl>
  );
}
