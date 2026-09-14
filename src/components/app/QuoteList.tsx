"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Customer, FollowUp, Quote } from "@/lib/types";
import { formatMoney } from "@/lib/utils/money";
import { formatShort, formatRelative } from "@/lib/utils/date";
import { Avatar } from "@/components/ui/Avatar";
import { StatusBadge } from "./StatusBadge";
import { cn } from "@/lib/utils/cn";

export interface QuoteRow {
  quote: Quote;
  customer: Customer;
  nextFollowUp: FollowUp | null;
}

function NextFollowUpCell({ row, today }: { row: QuoteRow; today: string }) {
  const { quote, nextFollowUp } = row;
  if (quote.status === "paused") return <span className="text-ink-400">Paused</span>;
  if (!nextFollowUp) {
    if (quote.status === "awaiting_reply") return <span className="text-ink-400">Sequence complete</span>;
    return <span className="text-ink-400">—</span>;
  }
  const overdue = nextFollowUp.scheduledFor < today;
  const dueToday = nextFollowUp.scheduledFor === today;
  return (
    <span className={cn(overdue || dueToday ? "font-medium text-brand-700" : "text-ink-700")}>
      {formatRelative(nextFollowUp.scheduledFor, today)}
      <span className="ml-1.5 text-ink-400">· #{nextFollowUp.sequenceNumber}</span>
    </span>
  );
}

export function QuoteList({ rows, today }: { rows: QuoteRow[]; today: string }) {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-100 text-left text-xs font-medium uppercase tracking-wide text-ink-400">
              <th className="px-5 py-3 font-medium">Customer</th>
              <th className="px-3 py-3 font-medium">Service</th>
              <th className="px-3 py-3 text-right font-medium">Amount</th>
              <th className="px-3 py-3 font-medium">Sent</th>
              <th className="px-3 py-3 font-medium">Next follow-up</th>
              <th className="px-3 py-3 text-center font-medium">Sent</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((row) => (
              <tr key={row.quote.id} className="group transition-colors hover:bg-ink-50/70">
                <td className="px-5 py-3.5">
                  <Link href={`/quotes/${row.quote.id}`} className="flex items-center gap-3">
                    <Avatar name={row.customer.name} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink-900 group-hover:underline">{row.customer.name}</span>
                      <span className="block truncate text-xs text-ink-500">{row.quote.quoteNumber}</span>
                    </span>
                  </Link>
                </td>
                <td className="max-w-[220px] truncate px-3 py-3.5 text-ink-700">{row.quote.serviceDescription}</td>
                <td className="px-3 py-3.5 text-right font-medium tabular-nums text-ink-900">{formatMoney(row.quote.amount)}</td>
                <td className="px-3 py-3.5 text-ink-600">{formatShort(row.quote.sentAt)}</td>
                <td className="px-3 py-3.5">
                  <NextFollowUpCell row={row} today={today} />
                </td>
                <td className="px-3 py-3.5 text-center tabular-nums text-ink-700">
                  {row.quote.followUpsSent}
                  <span className="text-ink-400">/{row.quote.schedule.length}</span>
                </td>
                <td className="px-3 py-3.5">
                  <StatusBadge status={row.quote.status} />
                </td>
                <td className="px-3 py-3.5 text-right">
                  <Link href={`/quotes/${row.quote.id}`} className="inline-flex rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700" aria-label={`Open quote for ${row.customer.name}`}>
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="divide-y divide-ink-100 md:hidden">
        {rows.map((row) => (
          <li key={row.quote.id}>
            <Link href={`/quotes/${row.quote.id}`} className="flex items-start gap-3 px-4 py-4 active:bg-ink-50">
              <Avatar name={row.customer.name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate font-medium text-ink-900">{row.customer.name}</p>
                  <p className="shrink-0 font-medium tabular-nums text-ink-900">{formatMoney(row.quote.amount)}</p>
                </div>
                <p className="truncate text-sm text-ink-600">{row.quote.serviceDescription}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-500">
                  <StatusBadge status={row.quote.status} />
                  <span>
                    Next: <NextFollowUpCell row={row} today={today} />
                  </span>
                  <span>
                    {row.quote.followUpsSent}/{row.quote.schedule.length} sent
                  </span>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
