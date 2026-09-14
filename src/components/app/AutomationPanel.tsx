"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, ChevronRight, Play, RotateCcw, Zap } from "lucide-react";
import { useAppStore, type AutomationRunSummary } from "@/lib/store/useAppStore";
import { createContext } from "@/lib/domain/context";
import { countDue } from "@/lib/domain/automation";
import { formatLong, formatWeekday, todayISO } from "@/lib/utils/date";
import { pluralize } from "@/lib/utils/text";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { EmailPreview } from "./EmailPreview";
import { Badge } from "@/components/ui/Badge";

/**
 * Phase 1 stand-in for the scheduled background job. Lets the owner run the
 * engine "as of today" or step the calendar forward to watch sequences play out.
 */
export function AutomationPanel() {
  const account = useAppStore((s) => s.account);
  const data = useAppStore((s) => s.data);
  const simulatedDate = useAppStore((s) => s.simulatedDate);
  const runAutomation = useAppStore((s) => s.runAutomation);
  const advanceDay = useAppStore((s) => s.advanceDay);
  const resetClock = useAppStore((s) => s.resetClock);
  const [result, setResult] = useState<AutomationRunSummary | null>(null);

  if (!account) return null;

  const today = simulatedDate ?? todayISO();
  const due = countDue(data, createContext(account.business, account.settings, today));
  const nextScheduled = data.followUps
    .filter((f) => f.status === "scheduled" && data.quotes.some((q) => q.id === f.quoteId && (q.status === "follow_up_scheduled")))
    .map((f) => f.scheduledFor)
    .sort()[0];

  return (
    <>
      <Card>
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <Zap className="h-4 w-4 text-brand-600" /> Automation
            </span>
          }
          description="In Phase 1 emails are simulated. Nothing is actually sent."
          action={simulatedDate ? <Badge tone="warning">Simulated clock</Badge> : <Badge tone="neutral">Live clock</Badge>}
        />
        <CardBody className="space-y-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Today is</p>
              <p className="font-display text-lg font-semibold text-ink-900">{formatWeekday(today)}</p>
            </div>
            <p className="text-sm text-ink-600">
              {due > 0 ? (
                <span className="font-medium text-brand-700">{pluralize(due, "follow-up")} due now</span>
              ) : nextScheduled ? (
                <>Nothing due. Next follow-up on {formatLong(nextScheduled)}.</>
              ) : (
                <>No follow-ups scheduled.</>
              )}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button icon={<Play className="h-4 w-4" />} onClick={() => setResult(runAutomation())}>
              Run automation
            </Button>
            <Button variant="outline" icon={<CalendarClock className="h-4 w-4" />} onClick={() => setResult(advanceDay(1))}>
              Simulate next day
            </Button>
            <Button variant="outline" onClick={() => setResult(advanceDay(7))}>
              Skip a week
            </Button>
            {simulatedDate ? (
              <Button variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={resetClock}>
                Back to today
              </Button>
            ) : null}
          </div>
          <p className="text-[13px] leading-relaxed text-ink-500">
            <strong className="font-medium text-ink-700">Run automation</strong> checks every active quote and sends whatever is due today.
            <strong className="ml-1 font-medium text-ink-700">Simulate next day</strong> moves the calendar forward one day and runs it again, so you can watch a sequence play out. In Phase 2 this runs by itself every morning.
          </p>
        </CardBody>
      </Card>

      <Modal
        open={result !== null}
        onClose={() => setResult(null)}
        size="lg"
        title={result && result.fired.length > 0 ? `${pluralize(result.fired.length, "follow-up")} sent` : "Nothing due today"}
        description={
          result
            ? result.fired.length > 0
              ? `Ran through ${formatLong(result.ranOn)}. ${pluralize(result.checked, "active quote")} checked. In Phase 1 these are simulated.`
              : `Ran through ${formatLong(result.ranOn)}. ${pluralize(result.checked, "active quote")} checked, none had a follow-up due.`
            : undefined
        }
        footer={
          <Button onClick={() => setResult(null)}>
            Done
          </Button>
        }
      >
        {result && result.fired.length > 0 ? (
          <ul className="space-y-5">
            {result.fired.map((f) => (
              <li key={f.followUp.id}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-ink-900">
                    Follow-up #{f.followUp.sequenceNumber} to {f.customer.name}
                    <span className="ml-2 font-normal text-ink-500">{f.quote.quoteNumber}</span>
                  </p>
                  <Link href={`/quotes/${f.quote.id}`} onClick={() => setResult(null)} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
                    Open quote <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <EmailPreview email={{ subject: f.message.subject, body: f.message.body }} to={f.message.to} from={f.message.fromName} compact />
              </li>
            ))}
          </ul>
        ) : result ? (
          <p className="text-sm text-ink-600">
            Try <strong className="font-medium text-ink-800">Simulate next day</strong> to move the calendar forward, or add a quote with a follow-up due sooner.
          </p>
        ) : null}
      </Modal>
    </>
  );
}
