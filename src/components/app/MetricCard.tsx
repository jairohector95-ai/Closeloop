import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils/cn";

export function MetricCard({
  label,
  value,
  detail,
  icon,
  emphasis,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <Card className={cn("px-5 py-4.5", emphasis && "border-brand-200 bg-brand-50/40")}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-medium text-ink-500">{label}</p>
        {icon ? <span className="text-ink-400">{icon}</span> : null}
      </div>
      <p className="mt-2 font-display text-[1.75rem] font-semibold leading-none text-ink-900 tabular-nums">{value}</p>
      {detail ? <p className="mt-2 text-[13px] text-ink-500">{detail}</p> : null}
    </Card>
  );
}
