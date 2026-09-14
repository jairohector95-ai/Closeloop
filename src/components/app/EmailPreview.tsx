import type { GeneratedEmail } from "@/lib/email/templates";
import { cn } from "@/lib/utils/cn";

export function EmailPreview({
  email,
  to,
  from,
  className,
  compact = false,
}: {
  email: GeneratedEmail;
  to?: string;
  from?: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-ink-200 bg-white", className)}>
      <div className={cn("space-y-1 border-b border-ink-100 bg-ink-50/70 text-[13px] text-ink-500", compact ? "px-4 py-2.5" : "px-5 py-3")}>
        {from ? (
          <p>
            <span className="inline-block w-12 text-ink-400">From</span>
            <span className="text-ink-700">{from}</span>
          </p>
        ) : null}
        {to ? (
          <p>
            <span className="inline-block w-12 text-ink-400">To</span>
            <span className="text-ink-700">{to}</span>
          </p>
        ) : null}
        <p>
          <span className="inline-block w-12 text-ink-400">Subject</span>
          <span className="font-medium text-ink-900">{email.subject}</span>
        </p>
      </div>
      <pre className={cn("whitespace-pre-wrap font-sans text-[14.5px] leading-relaxed text-ink-800", compact ? "px-4 py-3.5" : "px-5 py-4")}>{email.body}</pre>
    </div>
  );
}
