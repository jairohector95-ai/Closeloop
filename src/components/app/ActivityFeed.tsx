"use client";

import Link from "next/link";
import type { TimelineEvent, WorkspaceData } from "@/lib/types";
import { formatShort } from "@/lib/utils/date";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Activity } from "lucide-react";

export function ActivityFeed({ data, limit = 8 }: { data: WorkspaceData; limit?: number }) {
  const events = [...data.timeline]
    .filter((e) => e.type !== "follow_up_scheduled")
    .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
    .slice(0, limit);

  const customerFor = (event: TimelineEvent) => {
    const quote = data.quotes.find((q) => q.id === event.quoteId);
    return quote ? data.customers.find((c) => c.id === quote.customerId)?.name ?? "Customer" : "Customer";
  };

  return (
    <Card>
      <CardHeader title="Recent activity" description="What CloseLoop has been doing for you." />
      {events.length === 0 ? (
        <EmptyState icon={<Activity className="h-5 w-5" />} title="No activity yet" description="Add your first quote and activity will show up here." />
      ) : (
        <CardBody className="p-0 sm:p-0">
          <ul className="divide-y divide-ink-100">
            {events.map((event) => (
              <li key={event.id}>
                <Link href={`/quotes/${event.quoteId}`} className="flex items-start gap-3 px-5 py-3 hover:bg-ink-50/70 sm:px-6">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink-900">
                      <span className="font-medium">{customerFor(event)}</span>
                      <span className="text-ink-500"> · {event.title}</span>
                    </p>
                    {event.description ? <p className="truncate text-xs text-ink-500">{event.description}</p> : null}
                  </div>
                  <span className="shrink-0 text-xs text-ink-400">{formatShort(event.occurredAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </CardBody>
      )}
    </Card>
  );
}
