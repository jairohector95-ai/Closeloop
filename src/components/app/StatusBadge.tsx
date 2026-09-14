import type { QuoteStatus } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";

export const STATUS_META: Record<QuoteStatus, { label: string; tone: "neutral" | "brand" | "success" | "warning" | "danger" | "ink"; hint: string }> = {
  follow_up_scheduled: { label: "Follow-up scheduled", tone: "brand", hint: "CloseLoop will follow up automatically." },
  awaiting_reply: { label: "Awaiting reply", tone: "neutral", hint: "All follow-ups sent. Waiting on the customer." },
  replied: { label: "Replied", tone: "success", hint: "The customer got back to you. Follow-ups stopped." },
  won: { label: "Won", tone: "ink", hint: "You got the job." },
  lost: { label: "Lost", tone: "danger", hint: "This one didn't work out." },
  paused: { label: "Paused", tone: "warning", hint: "Follow-ups are on hold until you resume." },
};

export const STATUS_ORDER: QuoteStatus[] = ["follow_up_scheduled", "awaiting_reply", "replied", "won", "lost", "paused"];

export function StatusBadge({ status }: { status: QuoteStatus }) {
  const meta = STATUS_META[status];
  return (
    <Badge tone={meta.tone} dot>
      {meta.label}
    </Badge>
  );
}
