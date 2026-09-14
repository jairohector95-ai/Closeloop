"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, FileQuestion, Mail, Phone } from "lucide-react";
import { useAppStore } from "@/lib/store/useAppStore";
import { renderFollowUpEmail } from "@/lib/email/templates";
import { buildEmailContext } from "@/lib/domain/automation";
import { createContext } from "@/lib/domain/context";
import { pendingFollowUps } from "@/lib/domain/quotes";
import { formatMoney } from "@/lib/utils/money";
import { formatLong, todayISO } from "@/lib/utils/date";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { StatusBadge, STATUS_META } from "@/components/app/StatusBadge";
import { QuoteActions } from "@/components/app/QuoteActions";
import { Timeline, type TimelineItem, type UpcomingItem } from "@/components/app/Timeline";
import { TONES } from "@/lib/constants";

export default function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const justCreated = searchParams.get("created") === "1";
  const account = useAppStore((s) => s.account);
  const data = useAppStore((s) => s.data);
  const today = useAppStore((s) => s.simulatedDate ?? todayISO());

  const quote = data.quotes.find((q) => q.id === id);
  const customer = quote ? data.customers.find((c) => c.id === quote.customerId) : undefined;

  const { items, upcoming } = useMemo(() => {
    if (!quote || !customer || !account) return { items: [] as TimelineItem[], upcoming: [] as UpcomingItem[] };
    const ctx = createContext(account.business, account.settings, today);
    const events = data.timeline
      .filter((e) => e.quoteId === quote.id)
      .sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : a.occurredAt > b.occurredAt ? 1 : 0));

    const items: TimelineItem[] = events.map((event) => {
      const followUp = event.followUpId ? data.followUps.find((f) => f.id === event.followUpId) ?? null : null;
      const email =
        followUp && followUp.status === "sent" && followUp.subject && followUp.body
          ? { subject: followUp.subject, body: followUp.body }
          : null;
      return { event, followUp, email };
    });

    const upcoming: UpcomingItem[] =
      quote.status === "follow_up_scheduled"
        ? pendingFollowUps(data, quote.id).map((followUp) => ({
            followUp,
            email: renderFollowUpEmail(buildEmailContext(quote, customer, ctx, followUp.sequenceNumber)),
          }))
        : [];

    return { items, upcoming };
  }, [quote, customer, account, data, today]);

  if (!quote || !customer) {
    return (
      <Card>
        <EmptyState
          icon={<FileQuestion className="h-5 w-5" />}
          title="Quote not found"
          description="It may have been deleted. Head back to your quotes."
          action={
            <ButtonLink href="/quotes" variant="outline" icon={<ArrowLeft className="h-4 w-4" />}>
              Back to quotes
            </ButtonLink>
          }
        />
      </Card>
    );
  }

  const meta = STATUS_META[quote.status];
  const pausedPending = quote.status === "paused" ? pendingFollowUps(data, quote.id) : [];

  return (
    <div className="space-y-6">
      <Link href="/quotes" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-900">
        <ArrowLeft className="h-4 w-4" /> All quotes
      </Link>

      {justCreated ? (
        <div className="rise flex items-start gap-3 rounded-2xl border border-success-100 bg-success-50 px-5 py-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success-600" />
          <div>
            <p className="text-sm font-semibold text-success-700">Follow-up scheduled.</p>
            <p className="text-sm text-success-700/80">
              CloseLoop will check in with {customer.name.split(" ")[0]} automatically. Mark the quote as replied the moment you hear back and everything stops.
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-4">
          <Avatar name={customer.name} className="h-12 w-12 text-sm" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-semibold text-ink-900">{customer.name}</h1>
              <StatusBadge status={quote.status} />
              {quote.isDemo ? <Badge tone="neutral">Demo</Badge> : null}
            </div>
            <p className="mt-0.5 text-[15px] text-ink-600">
              {quote.serviceDescription} · <span className="font-medium text-ink-900">{formatMoney(quote.amount)}</span>
            </p>
            <p className="mt-0.5 text-sm text-ink-500">{meta.hint}</p>
          </div>
        </div>
        <QuoteActions quote={quote} customerName={customer.name} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader title="History" description="Everything that has happened with this quote, and what's coming next." />
          <CardBody>
            {quote.status === "paused" && pausedPending.length > 0 ? (
              <div className="mb-5 rounded-xl border border-warning-100 bg-warning-50 px-4 py-3 text-sm text-warning-700">
                Follow-ups are paused. {pausedPending.length} still in the sequence. When you resume, any that fell behind are moved forward so the customer never gets a burst of emails.
              </div>
            ) : null}
            <Timeline items={items} upcoming={upcoming} today={today} customerEmail={customer.email} />
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <CardBody className="space-y-4 text-sm">
              <dl className="grid grid-cols-[110px_1fr] gap-y-3">
                <dt className="text-ink-500">Quote number</dt>
                <dd className="font-medium text-ink-900">{quote.quoteNumber}</dd>
                <dt className="text-ink-500">Amount</dt>
                <dd className="font-medium text-ink-900">{formatMoney(quote.amount)}</dd>
                <dt className="text-ink-500">Date sent</dt>
                <dd className="text-ink-900">{formatLong(quote.sentAt)}</dd>
                <dt className="text-ink-500">Sequence</dt>
                <dd className="text-ink-900">
                  {quote.schedule.map((d) => `Day ${d}`).join(" · ")}
                  <span className="block text-xs text-ink-500">
                    {quote.followUpsSent} of {quote.schedule.length} sent · {TONES.find((t) => t.id === quote.tone)?.label} tone
                  </span>
                </dd>
              </dl>
              {quote.notes ? (
                <div className="rounded-xl bg-ink-50 px-3.5 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Notes</p>
                  <p className="mt-1 whitespace-pre-wrap text-ink-800">{quote.notes}</p>
                </div>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Customer" />
            <CardBody className="space-y-2.5 text-sm">
              <a href={`mailto:${customer.email}`} className="flex items-center gap-2.5 text-ink-800 hover:text-brand-700">
                <Mail className="h-4 w-4 text-ink-400" /> {customer.email}
              </a>
              {customer.phone ? (
                <a href={`tel:${customer.phone}`} className="flex items-center gap-2.5 text-ink-800 hover:text-brand-700">
                  <Phone className="h-4 w-4 text-ink-400" /> {customer.phone}
                </a>
              ) : (
                <p className="flex items-center gap-2.5 text-ink-400">
                  <Phone className="h-4 w-4" /> No phone on file
                </p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
