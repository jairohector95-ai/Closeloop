"use client";

import Link from "next/link";
import { ArrowRight, CalendarClock, CircleDollarSign, Inbox, MessageSquareReply, Plus, TrendingUp, Trophy } from "lucide-react";
import { useAppStore } from "@/lib/store/useAppStore";
import { computeDashboardMetrics } from "@/lib/metrics";
import { formatMoney } from "@/lib/utils/money";
import { pluralize } from "@/lib/utils/text";
import { todayISO } from "@/lib/utils/date";
import { nextFollowUp } from "@/lib/domain/quotes";
import { PageHeader } from "@/components/ui/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { MetricCard } from "@/components/app/MetricCard";
import { AutomationPanel } from "@/components/app/AutomationPanel";
import { ActivityFeed } from "@/components/app/ActivityFeed";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { QuoteList, type QuoteRow } from "@/components/app/QuoteList";

export default function DashboardPage() {
  const account = useAppStore((s) => s.account);
  const data = useAppStore((s) => s.data);
  const today = useAppStore((s) => s.simulatedDate ?? todayISO());
  const metrics = computeDashboardMetrics(data);

  const needsAttention: QuoteRow[] = data.quotes
    .filter((q) => q.status === "follow_up_scheduled" || q.status === "awaiting_reply")
    .map((quote) => ({
      quote,
      customer: data.customers.find((c) => c.id === quote.customerId)!,
      nextFollowUp: nextFollowUp(data, quote.id),
    }))
    .filter((row) => row.customer)
    .sort((a, b) => {
      const an = a.nextFollowUp?.scheduledFor ?? "9999";
      const bn = b.nextFollowUp?.scheduledFor ?? "9999";
      return an < bn ? -1 : an > bn ? 1 : 0;
    })
    .slice(0, 5);

  const firstName = account?.business.ownerName.split(" ")[0] ?? "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting}, ${firstName}`}
        description={
          metrics.awaitingResponse > 0
            ? `CloseLoop is following up on ${pluralize(metrics.awaitingResponse, "quote")} worth ${formatMoney(metrics.openPipelineValue)}.`
            : "Add a quote and CloseLoop will start following up for you."
        }
        actions={
          <ButtonLink href="/quotes/new" icon={<Plus className="h-4 w-4" />}>
            Add quote
          </ButtonLink>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard label="Quotes awaiting response" value={metrics.awaitingResponse} detail="Active quotes without a reply yet" icon={<Inbox className="h-4 w-4" />} />
        <MetricCard label="Follow-ups scheduled" value={metrics.followUpsScheduled} detail={`${metrics.followUpsSent} sent so far`} icon={<CalendarClock className="h-4 w-4" />} />
        <MetricCard label="Customers replied" value={metrics.customersReplied} detail="Follow-ups stopped automatically" icon={<MessageSquareReply className="h-4 w-4" />} />
        <MetricCard label="Jobs won" value={metrics.jobsWon} icon={<Trophy className="h-4 w-4" />} detail="Marked as won" />
        <MetricCard label="Total quote value" value={formatMoney(metrics.totalQuoteValue)} detail="All quotes except lost" icon={<CircleDollarSign className="h-4 w-4" />} />
        <MetricCard
          label="Potential recovered revenue"
          value={formatMoney(metrics.recoveredRevenue)}
          detail="Jobs won after at least one follow-up"
          icon={<TrendingUp className="h-4 w-4" />}
          emphasis
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader
              title="Up next"
              description="Active quotes, soonest follow-up first."
              action={
                <Link href="/quotes" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
                  View all quotes <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              }
            />
            {needsAttention.length === 0 ? (
              <EmptyState
                icon={<Inbox className="h-5 w-5" />}
                title="Nothing waiting on a follow-up"
                description="Every quote has either been answered or closed. Add a new one when you send your next estimate."
                action={
                  <ButtonLink href="/quotes/new" variant="outline" icon={<Plus className="h-4 w-4" />}>
                    Add quote
                  </ButtonLink>
                }
              />
            ) : (
              <CardBody className="p-0 sm:p-0">
                <QuoteList rows={needsAttention} today={today} />
              </CardBody>
            )}
          </Card>
          <ActivityFeed data={data} />
        </div>
        <div className="min-w-0 space-y-6">
          <AutomationPanel />
        </div>
      </div>
    </div>
  );
}
