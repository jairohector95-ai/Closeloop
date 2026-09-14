"use client";

import { useMemo, useState } from "react";
import { FileText, Plus, Search } from "lucide-react";
import type { QuoteStatus } from "@/lib/types";
import { useAppStore } from "@/lib/store/useAppStore";
import { nextFollowUp } from "@/lib/domain/quotes";
import { formatMoney } from "@/lib/utils/money";
import { todayISO } from "@/lib/utils/date";
import { PageHeader } from "@/components/ui/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { QuoteList, type QuoteRow } from "@/components/app/QuoteList";
import { STATUS_META, STATUS_ORDER } from "@/components/app/StatusBadge";
import { cn } from "@/lib/utils/cn";

type Filter = "all" | "active" | QuoteStatus;

export default function QuotesPage() {
  const data = useAppStore((s) => s.data);
  const today = useAppStore((s) => s.simulatedDate ?? todayISO());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const rows: QuoteRow[] = useMemo(
    () =>
      data.quotes
        .map((quote) => ({ quote, customer: data.customers.find((c) => c.id === quote.customerId)!, nextFollowUp: nextFollowUp(data, quote.id) }))
        .filter((r) => r.customer)
        .sort((a, b) => (a.quote.sentAt < b.quote.sentAt ? 1 : a.quote.sentAt > b.quote.sentAt ? -1 : 0)),
    [data],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length, active: 0 };
    for (const s of STATUS_ORDER) c[s] = 0;
    for (const r of rows) {
      c[r.quote.status] += 1;
      if (r.quote.status === "follow_up_scheduled" || r.quote.status === "awaiting_reply") c.active += 1;
    }
    return c;
  }, [rows]);

  const filtered = rows.filter((r) => {
    if (filter === "active" && r.quote.status !== "follow_up_scheduled" && r.quote.status !== "awaiting_reply") return false;
    if (filter !== "all" && filter !== "active" && r.quote.status !== filter) return false;
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      r.customer.name.toLowerCase().includes(q) ||
      r.customer.email.toLowerCase().includes(q) ||
      r.quote.quoteNumber.toLowerCase().includes(q) ||
      r.quote.serviceDescription.toLowerCase().includes(q)
    );
  });

  const total = filtered.reduce((sum, r) => sum + r.quote.amount, 0);

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "active", label: "Active" },
    ...STATUS_ORDER.map((s) => ({ id: s as Filter, label: STATUS_META[s].label })),
  ];

  return (
    <div>
      <PageHeader
        title="Quotes"
        description={rows.length > 0 ? `${rows.length} quotes · ${formatMoney(total)} ${filter === "all" && !query ? "total" : "in this view"}` : "Every estimate you're tracking, in one place."}
        actions={
          <ButtonLink href="/quotes/new" icon={<Plus className="h-4 w-4" />}>
            Add quote
          </ButtonLink>
        }
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileText className="h-5 w-5" />}
            title="No quotes yet"
            description="Add the last estimate you sent and CloseLoop will schedule the follow-ups for you."
            action={
              <ButtonLink href="/quotes/new" icon={<Plus className="h-4 w-4" />}>
                Add your first quote
              </ButtonLink>
            }
          />
        </Card>
      ) : (
        <Card>
          <div className="flex flex-col gap-3 border-b border-ink-100 p-4 sm:px-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by customer, email, service or quote number"
                className="h-10.5 w-full rounded-xl border border-ink-200 bg-white pl-10 pr-3.5 text-[15px] placeholder:text-ink-400 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100"
                aria-label="Search quotes"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {filters.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors",
                    filter === f.id ? "bg-ink-900 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200",
                  )}
                  aria-pressed={filter === f.id}
                >
                  {f.label}
                  <span className={cn("ml-1.5 tabular-nums", filter === f.id ? "text-ink-300" : "text-ink-400")}>{counts[f.id] ?? 0}</span>
                </button>
              ))}
            </div>
          </div>
          {filtered.length === 0 ? (
            <EmptyState icon={<Search className="h-5 w-5" />} title="No quotes match" description="Try a different search or clear the status filter." />
          ) : (
            <QuoteList rows={filtered} today={today} />
          )}
        </Card>
      )}
    </div>
  );
}
