import { LoopRail } from "./LoopRail";
import { Badge } from "@/components/ui/Badge";

/** A faithful miniature of the quote detail screen, used as the hero visual. */
export function HeroMock() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="rise rise-2 overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-float">
        <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-ink-200" />
          <span className="h-2.5 w-2.5 rounded-full bg-ink-200" />
          <span className="h-2.5 w-2.5 rounded-full bg-ink-200" />
          <span className="ml-3 h-5 flex-1 rounded-md bg-ink-50 text-[11px] leading-5 text-ink-400 pl-2">closeloop.app / quotes / EST-1041</span>
        </div>
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">SM</span>
              <div>
                <p className="text-sm font-semibold text-ink-900">Sarah Mitchell</p>
                <p className="text-xs text-ink-500">Interior painting · 3 bedrooms</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-display text-lg font-semibold text-ink-900">$2,850</p>
              <Badge tone="success" dot>
                Replied
              </Badge>
            </div>
          </div>
          <div className="mt-5 border-t border-ink-100 pt-4">
            <LoopRail compact />
          </div>
        </div>
      </div>

      <div className="rise rise-4 absolute -bottom-6 -left-4 hidden w-64 rounded-xl border border-ink-200 bg-white p-3.5 shadow-float sm:block lg:-left-10">
        <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">Follow-up #2 · sent automatically</p>
        <p className="mt-1 text-[13px] font-medium text-ink-900">Checking in on your interior painting estimate</p>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-500">Hi Sarah, hope your week is going well. I wanted to check in on the estimate for your interior painting…</p>
      </div>
    </div>
  );
}
