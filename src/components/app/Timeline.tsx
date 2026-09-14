"use client";

import { useState } from "react";
import { AlertTriangle, CalendarPlus, CheckCircle2, ChevronDown, FilePlus2, Loader2, Mail, MailCheck, MessageSquareReply, Pause, Play, Pencil, RotateCcw, Trophy, XCircle } from "lucide-react";
import type { FollowUp, TimelineEvent, TimelineEventType } from "@/lib/types";
import type { GeneratedEmail } from "@/lib/email/templates";
import { formatLong, formatShort } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";
import { EmailPreview } from "./EmailPreview";

const ICONS: Record<TimelineEventType, { icon: typeof Mail; className: string }> = {
  quote_added: { icon: FilePlus2, className: "bg-ink-900 text-white" },
  quote_updated: { icon: Pencil, className: "bg-ink-100 text-ink-600" },
  follow_up_scheduled: { icon: CalendarPlus, className: "bg-brand-50 text-brand-700" },
  follow_up_rescheduled: { icon: CalendarPlus, className: "bg-brand-50 text-brand-700" },
  follow_up_sent: { icon: MailCheck, className: "bg-brand-600 text-white" },
  follow_up_failed: { icon: AlertTriangle, className: "bg-danger-100 text-danger-700" },
  reply_detected: { icon: MessageSquareReply, className: "bg-success-50 text-success-700" },
  replied: { icon: CheckCircle2, className: "bg-success-600 text-white" },
  won: { icon: Trophy, className: "bg-ink-900 text-white" },
  lost: { icon: XCircle, className: "bg-danger-100 text-danger-700" },
  paused: { icon: Pause, className: "bg-warning-100 text-warning-700" },
  resumed: { icon: Play, className: "bg-success-50 text-success-700" },
  reopened: { icon: RotateCcw, className: "bg-ink-100 text-ink-600" },
};

export interface TimelineItem {
  event: TimelineEvent;
  followUp: FollowUp | null;
  /** For scheduled follow-ups: the email that will go out. For sent ones: what was sent. */
  email: GeneratedEmail | null;
}

export interface UpcomingItem {
  followUp: FollowUp;
  email: GeneratedEmail;
}

function EmailToggle({ email, label, to }: { email: GeneratedEmail; label: string; to?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-medium text-brand-700 hover:bg-brand-50"
        aria-expanded={open}
      >
        <Mail className="h-3.5 w-3.5" />
        {label}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open ? <EmailPreview email={email} to={to} compact className="mt-2" /> : null}
    </div>
  );
}

export function Timeline({
  items,
  upcoming,
  today,
  customerEmail,
  onRetry,
}: {
  items: TimelineItem[];
  upcoming: UpcomingItem[];
  today: string;
  customerEmail: string;
  onRetry?: (followUpId: string) => void;
}) {
  // Group by day so the list reads like a story rather than a log.
  const groups: { day: string; items: TimelineItem[] }[] = [];
  for (const item of items) {
    const day = item.event.occurredAt.slice(0, 10);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }

  return (
    <ol className="relative">
      <span className="absolute bottom-3 left-[15px] top-3 w-px bg-ink-200" aria-hidden="true" />
      {groups.map((group) => (
        <li key={group.day} className="relative mb-6 last:mb-0">
          <p className="mb-2 pl-11 text-xs font-medium uppercase tracking-wide text-ink-400">{formatLong(group.day)}</p>
          <ul className="space-y-3">
            {group.items.map(({ event, email }) => {
              const meta = ICONS[event.type];
              const Icon = meta.icon;
              return (
                <li key={event.id} className="relative flex gap-4">
                  <span className={cn("relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white", meta.className)}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1 pt-1">
                    <p className="text-sm font-medium text-ink-900">{event.title}</p>
                    {event.description ? <p className="text-sm text-ink-500">{event.description}</p> : null}
                    {email && event.type === "follow_up_sent" ? <EmailToggle email={email} label="View email sent" to={customerEmail} /> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </li>
      ))}

      {upcoming.length > 0 ? (
        <li className="relative">
          <p className="mb-2 pl-11 text-xs font-medium uppercase tracking-wide text-ink-400">Coming up</p>
          <ul className="space-y-3">
            {upcoming.map(({ followUp, email }, index) => {
              const overdue = followUp.scheduledFor < today;
              const dueToday = followUp.scheduledFor === today;
              const failed = followUp.status === "failed";
              const sending = followUp.status === "sending";
              return (
                <li key={followUp.id} className="relative flex gap-4">
                  <span
                    className={cn(
                      "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 bg-white ring-4 ring-white",
                      failed ? "border-danger-600 text-danger-700" : sending ? "border-brand-400 text-brand-600" : "border-dashed",
                      !failed && !sending && (index === 0 ? "border-brand-400 text-brand-600" : "border-ink-300 text-ink-400"),
                      !failed && !sending && index === 0 && "loop-pulse",
                    )}
                  >
                    {failed ? <AlertTriangle className="h-3.5 w-3.5" /> : sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                  </span>
                  <div className="min-w-0 flex-1 pt-1">
                    <p className="text-sm font-medium text-ink-900">
                      Follow-up #{followUp.sequenceNumber}
                      <span className={cn("ml-2 text-sm font-normal", failed ? "text-danger-700" : overdue || dueToday ? "text-brand-700" : "text-ink-500")}>
                        {failed
                          ? "could not be sent"
                          : sending
                            ? "sending…"
                            : dueToday
                              ? "due today"
                              : overdue
                                ? `was due ${formatShort(followUp.scheduledFor)} · sends on next run`
                                : formatLong(followUp.scheduledFor)}
                      </span>
                    </p>
                    {failed && followUp.lastError ? <p className="text-sm text-ink-500">{followUp.lastError}</p> : null}
                    {followUp.nextAttemptAt && !failed && !sending ? <p className="text-sm text-ink-500">Retrying automatically after a temporary delivery problem.</p> : null}
                    <div className="flex flex-wrap items-center gap-2">
                      <EmailToggle email={email} label="Preview email" to={customerEmail} />
                      {failed && onRetry ? (
                        <button type="button" onClick={() => onRetry(followUp.id)} className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-medium text-danger-700 hover:bg-danger-50">
                          <RotateCcw className="h-3.5 w-3.5" /> Try again
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </li>
      ) : null}
    </ol>
  );
}
