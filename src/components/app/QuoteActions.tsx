"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, MoreHorizontal, Pause, Pencil, Play, RotateCcw, Trash2, Trophy, XCircle } from "lucide-react";
import type { Quote } from "@/lib/types";
import { useAppStore } from "@/lib/store/useAppStore";
import { useToast } from "@/components/ui/Toast";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

export function QuoteActions({ quote, customerName }: { quote: Quote; customerName: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const store = useAppStore();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const active = quote.status === "follow_up_scheduled" || quote.status === "awaiting_reply";

  const act = (fn: () => void, title: string, description?: string) => {
    fn();
    setMenuOpen(false);
    toast({ kind: "success", title, description });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {active || quote.status === "paused" ? (
          <Button
            variant="outline"
            icon={<CheckCircle2 className="h-4 w-4 text-success-600" />}
            onClick={() => act(() => store.markReplied(quote.id), `${customerName} replied`, "Follow-ups stopped for this quote.")}
          >
            Mark as replied
          </Button>
        ) : null}
        {quote.status !== "won" ? (
          <Button icon={<Trophy className="h-4 w-4" />} onClick={() => act(() => store.markWon(quote.id), "Job won", "Congrats. Follow-ups stopped.")}>
            Mark as won
          </Button>
        ) : null}
        {quote.status !== "lost" && quote.status !== "won" ? (
          <Button variant="outline" icon={<XCircle className="h-4 w-4 text-ink-500" />} onClick={() => act(() => store.markLost(quote.id), "Marked as lost", "Follow-ups stopped.")}>
            Mark as lost
          </Button>
        ) : null}
        {active ? (
          <Button variant="outline" icon={<Pause className="h-4 w-4 text-ink-500" />} onClick={() => act(() => store.pauseQuote(quote.id), "Follow-ups paused", "Nothing will be sent until you resume.")}>
            Pause follow-ups
          </Button>
        ) : null}
        {quote.status === "paused" ? (
          <Button variant="outline" icon={<Play className="h-4 w-4 text-success-600" />} onClick={() => act(() => store.resumeQuote(quote.id), "Follow-ups resumed")}>
            Resume follow-ups
          </Button>
        ) : null}
        {quote.status === "won" || quote.status === "lost" ? (
          <Button variant="outline" icon={<RotateCcw className="h-4 w-4 text-ink-500" />} onClick={() => act(() => store.reopenQuote(quote.id), "Moved back to Replied")}>
            Reopen
          </Button>
        ) : null}

        <div className="relative">
          <Button variant="ghost" onClick={() => setMenuOpen((v) => !v)} aria-haspopup="menu" aria-expanded={menuOpen} aria-label="More actions" icon={<MoreHorizontal className="h-4 w-4" />} />
          {menuOpen ? (
            <>
              <button type="button" className="fixed inset-0 z-30 cursor-default" onClick={() => setMenuOpen(false)} aria-label="Close menu" tabIndex={-1} />
              <div role="menu" className="rise absolute right-0 z-40 mt-1 w-44 overflow-hidden rounded-xl border border-ink-200 bg-white p-1 shadow-float">
                <ButtonLink href={`/quotes/${quote.id}/edit`} variant="ghost" size="sm" className="w-full justify-start" icon={<Pencil className="h-4 w-4" />}>
                  Edit quote
                </ButtonLink>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-danger-700 hover:bg-danger-50"
                  icon={<Trash2 className="h-4 w-4" />}
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmDelete(true);
                  }}
                >
                  Delete quote
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this quote?"
        description={`${customerName}'s quote and its entire history will be removed. This can't be undone.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                store.deleteQuote(quote.id);
                toast({ kind: "info", title: "Quote deleted" });
                router.push("/quotes");
              }}
            >
              Delete quote
            </Button>
          </>
        }
      />
    </>
  );
}
