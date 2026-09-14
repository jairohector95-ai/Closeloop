import Link from "next/link";
import { cn } from "@/lib/utils/cn";

export function LoopMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("h-7 w-7", className)} fill="none">
      <rect width="32" height="32" rx="9" className="fill-ink-900" />
      <path
        d="M16 8.5a7.5 7.5 0 1 1-6.6 3.9"
        stroke="white"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path d="M7.5 8.5v5h5" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="16" r="2.2" className="fill-brand-400" />
    </svg>
  );
}

export function Logo({ href = "/", className, light = false }: { href?: string; className?: string; light?: boolean }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5", className)} aria-label="CloseLoop home">
      <LoopMark />
      <span className={cn("font-display text-[1.15rem] font-semibold tracking-tight", light ? "text-white" : "text-ink-900")}>
        CloseLoop
      </span>
    </Link>
  );
}
