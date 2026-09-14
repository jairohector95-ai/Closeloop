"use client";

import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store/useAppStore";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/ui/PageHeader";
import { QuoteForm } from "@/components/app/QuoteForm";
import { formatShort, addDays } from "@/lib/utils/date";

export default function NewQuotePage() {
  const router = useRouter();
  const addQuote = useAppStore((s) => s.addQuote);
  const { toast } = useToast();

  return (
    <div>
      <PageHeader title="Add a quote" description="Tell CloseLoop about an estimate you've already sent. It handles the follow-ups from here." />
      <QuoteForm
        submitLabel="Save and schedule follow-ups"
        onCancel={() => router.back()}
        onSubmit={(input) => {
          const id = addQuote(input);
          const first = input.schedule[0];
          toast({
            kind: "success",
            title: "Follow-up scheduled.",
            description: first ? `First follow-up goes out ${formatShort(addDays(input.sentAt, first))}. It stops the moment they reply.` : undefined,
          });
          router.push(`/quotes/${id}?created=1`);
        }}
      />
    </div>
  );
}
