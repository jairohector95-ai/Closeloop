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
  const mode = useAppStore((s) => s.mode);
  const data = useAppStore((s) => s.data);
  const simulatedDate = useAppStore((s) => s.simulatedDate);
  const lastSweep = useAppStore((s) => s.lastSweep);
  const runAutomation = useAppStore((s) => s.runAutomation);
  const advanceDay = useAppStore((s) => s.advanceDay);
  const resetClock = useAppStore((s) => s.resetClock);
  const [result, setResult] = useState<AutomationRunSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  if (!account) return null;

  const run = async (fn: () => Promise<AutomationRunSummary>) => {
    setBusy(true);
    setRunError(null);
    try {
      setResult(await fn());
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "Couldn't run automation.");
    } finally {
      setBusy(false);
    }
  };

  const today = mode === "cloud" ? todayISO() : (simulatedDate ?? todayISO());
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
          description={mode === "cloud" ? "CloseLoop checks for due follow-ups every 15 minutes and sends them for you." : "In local mode emails are simulated. Nothing is actually sent."}
          action={
            mode === "cloud" ? (
              <Badge tone="success">Automatic</Badge>
            ) : simulatedDate ? (
              <Badge tone="warning">Simulated clock</Badge>
            ) : (
              <Badge tone="neutral">Live clock</Badge>
            )
          }
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

          {mode === "cloud" ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Button icon={<Play className="h-4 w-4" />} loading={busy} onClick={() => void run(runAutomation)}>
                  Check now
                </Button>
                <span className="text-[13px] text-ink-500">
                  {lastSweep ? `Last checked ${formatLong(lastSweep.ran_at)} at ${new Date(lastSweep.ran_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Not checked yet"}
                </span>
              </div>
              {lastSweep?.errors?.length ? (
                <p className="rounded-xl border border-warning-100 bg-warning-50 px-4 py-3 text-[13px] text-warning-700">{lastSweep.errors[0]}</p>
              ) : null}
              {runError ? <p className="text-[13px] text-danger-700">{runError}</p> : null}
              <p className="text-[13px] leading-relaxed text-ink-500">
                Follow-ups go out from <strong className="font-medium text-ink-700">{account.business.name} via CloseLoop</strong>. When a customer replies, the reply lands in your inbox at{" "}
                <strong className="font-medium text-ink-700">{account.business.email}</strong> and the sequence stops by itself.
              </p>
            </>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Button icon={<Play className="h-4 w-4" />} loading={busy} onClick={() => void run(runAutomation)}>
                  Run automation
                </Button>
                <Button variant="outline" icon={<CalendarClock className="h-4 w-4" />} disabled={busy} onClick={() => void run(() => advanceDay(1))}>
                  Simulate next day
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => void run(() => advanceDay(7))}>
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
                <strong className="ml-1 font-medium text-ink-700">Simulate next day</strong> moves the calendar forward one day and runs it again, so you can watch a sequence play out.
              </p>
            </>
          )}
        </CardBody>
      </Card>

      <Modal
        open={result !== null}
        onClose={() => setResult(null)}
        size="lg"
        title={result && result.fired.length > 0 ? `${pluralize(result.fired.length, "follow-up")} sent` : result?.errors?.length ? "Couldn't send" : "Nothing due today"}
        description={
          result
            ? result.errors?.length
              ? result.errors[0]
              : result.fired.length > 0
                ? `Ran through ${formatLong(result.ranOn)}. ${pluralize(result.checked, "active quote")} checked.${mode === "local" ? " In local mode these are simulated." : ""}`
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
                <EmailPreview email={{ subject: f.message.subject, body: f.message.body }} to={f.message.to} from={f.message.fromName} replyTo={f.message.replyTo || undefined} compact />
              </li>
            ))}
          </ul>
        ) : result && !result.errors?.length ? (
          <p className="text-sm text-ink-600">
            {mode === "cloud" ? (
              <>Follow-ups go out on their scheduled day. Nothing else to do.</>
            ) : (
              <>
                Try <strong className="font-medium text-ink-800">Simulate next day</strong> to move the calendar forward, or add a quote with a follow-up due sooner.
              </>
            )}
          </p>
        ) : null}
      </Modal>
    </>
  );
}
