"use client";

import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { useAppStore } from "@/lib/store/useAppStore";
import { computeAdminMetrics } from "@/lib/metrics";
import { PLANS, businessTypeLabel, planById } from "@/lib/constants";
import { formatMoney } from "@/lib/utils/money";
import { formatShort } from "@/lib/utils/date";
import { Logo } from "@/components/ui/Logo";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { MetricCard } from "@/components/app/MetricCard";
import { PageSkeleton } from "@/components/ui/Skeleton";

/**
 * Owner-only view. Phase 1: local demo data, no auth. Phase 2: gate behind an
 * admin role and read from the real database.
 */
export default function AdminPage() {
  const hydrated = useAppStore((s) => s.hydrated);
  const account = useAppStore((s) => s.account);
  const demoAccounts = useAppStore((s) => s.demoAccounts);
  const data = useAppStore((s) => s.data);

  const metrics = computeAdminMetrics(account, demoAccounts, data);
  const accounts = [...(account ? [account] : []), ...demoAccounts];

  const planBreakdown = PLANS.map((p) => ({
    plan: p,
    count: accounts.filter((a) => a.subscription.plan === p.id && a.subscription.status !== "cancelled").length,
  }));

  return (
    <div className="min-h-screen bg-ink-50">
      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo />
            <Badge tone="ink">
              <Lock className="h-3 w-3" /> Owner admin
            </Badge>
          </div>
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900">
            <ArrowLeft className="h-4 w-4" /> Back to app
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {!hydrated ? (
          <PageSkeleton />
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="font-display text-2xl font-semibold text-ink-900 sm:text-[1.75rem]">Business overview</h1>
                <p className="mt-1 text-[15px] text-ink-500">How CloseLoop itself is doing. Numbers below are local demo data until Phase 2 connects a real database.</p>
              </div>
              <Badge tone="warning">Demo data · local only</Badge>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <MetricCard label="Total users" value={metrics.totalUsers} detail={`${metrics.trialUsers} on trial · ${metrics.paidUsers} paying`} />
              <MetricCard label="Estimated MRR" value={formatMoney(metrics.mrr)} detail="Active paid subscriptions × plan price" emphasis />
              <MetricCard label="Trial → paid conversion" value={`${Math.round(metrics.conversionRate * 100)}%`} detail="Paying users ÷ total users" />
              <MetricCard label="Trial users" value={metrics.trialUsers} detail="Currently in a free trial" />
              <MetricCard label="Paid users" value={metrics.paidUsers} detail="Starter and Pro" />
              <MetricCard label="Active quotes" value={metrics.activeQuotes} detail="Being followed up right now" />
              <MetricCard label="Quotes won" value={metrics.quotesWon} />
              <MetricCard label="Follow-ups sent" value={metrics.followUpsSent} detail="Simulated in Phase 1" />
              <MetricCard label="Jobs recovered" value={metrics.jobsRecovered} detail={`${formatMoney(metrics.recoveredRevenue)} won after a follow-up`} />
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
              <Card>
                <CardHeader title="Accounts" description="Every business on the platform." />
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-ink-100 text-left text-xs font-medium uppercase tracking-wide text-ink-400">
                        <th className="px-5 py-3 font-medium">Business</th>
                        <th className="px-3 py-3 font-medium">Trade</th>
                        <th className="px-3 py-3 font-medium">Plan</th>
                        <th className="px-3 py-3 font-medium">Status</th>
                        <th className="px-3 py-3 font-medium">Joined</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {accounts.map((a) => (
                        <tr key={a.business.id}>
                          <td className="px-5 py-3">
                            <p className="font-medium text-ink-900">
                              {a.business.name}
                              {account && a.business.id === account.business.id ? <span className="ml-2 text-xs font-normal text-brand-700">you</span> : null}
                            </p>
                            <p className="text-xs text-ink-500">{a.user.email}</p>
                          </td>
                          <td className="px-3 py-3 text-ink-600">{businessTypeLabel(a.business.type)}</td>
                          <td className="px-3 py-3 text-ink-800">{planById(a.subscription.plan).name}</td>
                          <td className="px-3 py-3">
                            <Badge
                              tone={
                                a.subscription.status === "active" ? "success" : a.subscription.status === "trialing" ? "brand" : a.subscription.status === "cancelled" ? "danger" : "neutral"
                              }
                            >
                              {a.subscription.status}
                            </Badge>
                          </td>
                          <td className="px-3 py-3 text-ink-600">{formatShort(a.business.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <div className="space-y-6">
                <Card>
                  <CardHeader title="Plans" />
                  <CardBody className="space-y-3">
                    {planBreakdown.map(({ plan, count }) => (
                      <div key={plan.id} className="flex items-center justify-between text-sm">
                        <div>
                          <p className="font-medium text-ink-900">{plan.name}</p>
                          <p className="text-xs text-ink-500">{plan.priceMonthly === 0 ? "Free" : `${formatMoney(plan.priceMonthly)}/mo`}</p>
                        </div>
                        <span className="font-display text-lg font-semibold tabular-nums text-ink-900">{count}</span>
                      </div>
                    ))}
                  </CardBody>
                </Card>
                <Card>
                  <CardHeader title="Phase 2 will add" />
                  <CardBody>
                    <ul className="space-y-2 text-sm text-ink-600">
                      {["Real user accounts (Supabase auth)", "Stripe subscription revenue", "Email delivery and reply rates", "Signup funnel and churn", "Support inbox"].map((item) => (
                        <li key={item} className="flex gap-2">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-300" aria-hidden="true" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </CardBody>
                </Card>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
