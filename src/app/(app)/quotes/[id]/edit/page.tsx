"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileQuestion } from "lucide-react";
import { useAppStore } from "@/lib/store/useAppStore";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ButtonLink } from "@/components/ui/Button";
import { QuoteForm } from "@/components/app/QuoteForm";

export default function EditQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const quote = useAppStore((s) => s.data.quotes.find((q) => q.id === id));
  const customer = useAppStore((s) => (quote ? s.data.customers.find((c) => c.id === quote.customerId) : undefined));
  const updateQuote = useAppStore((s) => s.updateQuote);

  if (!quote || !customer) {
    return (
      <Card>
        <EmptyState
          icon={<FileQuestion className="h-5 w-5" />}
          title="Quote not found"
          action={
            <ButtonLink href="/quotes" variant="outline" icon={<ArrowLeft className="h-4 w-4" />}>
              Back to quotes
            </ButtonLink>
          }
        />
      </Card>
    );
  }

  return (
    <div>
      <PageHeader
        title="Edit quote"
        description={
          quote.followUpsSent > 0
            ? `${quote.followUpsSent} follow-up${quote.followUpsSent === 1 ? " has" : "s have"} already gone out. Changing the schedule only affects the ones still to come.`
            : "Changing the schedule reschedules the follow-ups."
        }
      />
      <QuoteForm
        initial={{ quote, customer }}
        submitLabel="Save changes"
        onCancel={() => router.push(`/quotes/${quote.id}`)}
        onSubmit={(input) => {
          updateQuote(quote.id, input);
          toast({ kind: "success", title: "Quote updated" });
          router.push(`/quotes/${quote.id}`);
        }}
      />
    </div>
  );
}
