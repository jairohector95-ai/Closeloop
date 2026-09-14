"use client";

import { useMemo, useState } from "react";
import { Eye } from "lucide-react";
import type { Quote, QuoteInput, Tone } from "@/lib/types";
import { validateQuoteForm, type FieldErrors, type QuoteFormValues } from "@/lib/validation";
import { renderFollowUpEmail } from "@/lib/email/templates";
import { useAppStore } from "@/lib/store/useAppStore";
import { todayISO } from "@/lib/utils/date";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { TonePicker } from "./TonePicker";
import { ScheduleEditor } from "./ScheduleEditor";
import { EmailPreview } from "./EmailPreview";

interface Props {
  initial?: { quote: Quote; customer: { name: string; email: string; phone: string | null } };
  onSubmit: (input: QuoteInput) => void;
  onCancel: () => void;
  submitLabel: string;
}

function nextQuoteNumber(existing: Quote[]): string {
  const year = new Date().getFullYear();
  const numbers = existing
    .map((q) => /(\d+)$/.exec(q.quoteNumber)?.[1])
    .filter((n): n is string => Boolean(n))
    .map(Number);
  const next = numbers.length ? Math.max(...numbers) + 1 : 1001;
  return `EST-${year}-${String(next).padStart(4, "0")}`;
}

export function QuoteForm({ initial, onSubmit, onCancel, submitLabel }: Props) {
  const account = useAppStore((s) => s.account);
  const quotes = useAppStore((s) => s.data.quotes);
  const settings = account?.settings;

  const [values, setValues] = useState<QuoteFormValues>(() =>
    initial
      ? {
          customerName: initial.customer.name,
          customerEmail: initial.customer.email,
          customerPhone: initial.customer.phone ?? "",
          quoteNumber: initial.quote.quoteNumber,
          serviceDescription: initial.quote.serviceDescription,
          amount: String(initial.quote.amount),
          sentAt: initial.quote.sentAt,
          notes: initial.quote.notes,
          schedule: initial.quote.schedule.map(String),
          tone: initial.quote.tone,
        }
      : {
          customerName: "",
          customerEmail: "",
          customerPhone: "",
          quoteNumber: nextQuoteNumber(quotes),
          serviceDescription: "",
          amount: "",
          sentAt: todayISO(),
          notes: "",
          schedule: (settings?.defaultSchedule ?? [2, 5, 10]).map(String),
          tone: settings?.defaultTone ?? "friendly",
        },
  );
  const [errors, setErrors] = useState<FieldErrors<QuoteFormValues>>({});
  const [showPreview, setShowPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const set = <K extends keyof QuoteFormValues>(key: K, value: QuoteFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const preview = useMemo(
    () =>
      renderFollowUpEmail({
        customerName: values.customerName.trim() || "Sarah",
        businessName: account?.business.name ?? "Your business",
        ownerName: account?.business.ownerName ?? "You",
        serviceDescription: values.serviceDescription.trim() || "project",
        amount: Number(values.amount.replace(/[$,\s]/g, "")) || 0,
        quoteNumber: values.quoteNumber.trim() || "EST-0001",
        sequenceNumber: 1,
        sequenceLength: values.schedule.length,
        tone: values.tone,
        signature: settings?.signature,
      }),
    [values, account, settings],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const { errors: nextErrors, input } = validateQuoteForm(values);
    setErrors(nextErrors);
    if (!input) {
      const firstError = Object.keys(nextErrors)[0];
      document.getElementById(firstError)?.focus();
      return;
    }
    setSubmitting(true);
    onSubmit(input);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <Card>
          <CardHeader title="Customer" description="Who did you send the estimate to?" />
          <CardBody className="grid gap-5 sm:grid-cols-2">
            <Field label="Customer name" htmlFor="customerName" error={errors.customerName}>
              <Input id="customerName" value={values.customerName} onChange={(e) => set("customerName", e.target.value)} placeholder="Sarah Mitchell" autoComplete="off" error={errors.customerName} />
            </Field>
            <Field label="Customer email" htmlFor="customerEmail" error={errors.customerEmail}>
              <Input id="customerEmail" type="email" value={values.customerEmail} onChange={(e) => set("customerEmail", e.target.value)} placeholder="sarah@example.com" autoComplete="off" error={errors.customerEmail} />
            </Field>
            <Field label="Customer phone" htmlFor="customerPhone" optional>
              <Input id="customerPhone" type="tel" value={values.customerPhone} onChange={(e) => set("customerPhone", e.target.value)} placeholder="(555) 201-4471" autoComplete="off" />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Quote" description="The estimate you already sent." />
          <CardBody className="grid gap-5 sm:grid-cols-2">
            <Field label="Quote / estimate number" htmlFor="quoteNumber" error={errors.quoteNumber}>
              <Input id="quoteNumber" value={values.quoteNumber} onChange={(e) => set("quoteNumber", e.target.value)} error={errors.quoteNumber} />
            </Field>
            <Field label="Quote amount" htmlFor="amount" error={errors.amount}>
              <Input id="amount" inputMode="decimal" prefix="$" value={values.amount} onChange={(e) => set("amount", e.target.value)} placeholder="2,850" error={errors.amount} />
            </Field>
            <Field label="Service description" htmlFor="serviceDescription" error={errors.serviceDescription} className="sm:col-span-2" hint="This shows up in the follow-up emails, so keep it plain: “Interior painting, 3 bedrooms”.">
              <Input id="serviceDescription" value={values.serviceDescription} onChange={(e) => set("serviceDescription", e.target.value)} placeholder="Interior painting, 3 bedrooms" error={errors.serviceDescription} />
            </Field>
            <Field label="Date quote was sent" htmlFor="sentAt" error={errors.sentAt}>
              <Input id="sentAt" type="date" max={todayISO()} value={values.sentAt} onChange={(e) => set("sentAt", e.target.value)} error={errors.sentAt} />
            </Field>
            <Field label="Notes" htmlFor="notes" optional className="sm:col-span-2" hint="Only you see these.">
              <Textarea id="notes" value={values.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Wants it done before the holidays." />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Follow-up sequence" description="When should CloseLoop check in if they haven't replied?" />
          <CardBody className="space-y-6">
            <ScheduleEditor value={values.schedule} onChange={(next) => set("schedule", next)} sentAt={values.sentAt} error={errors.schedule} />
            <div>
              <p className="mb-2 text-sm font-medium text-ink-800">Email tone</p>
              <TonePicker value={values.tone} onChange={(tone: Tone) => set("tone", tone)} compact />
            </div>
          </CardBody>
        </Card>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="outline" className="lg:hidden" icon={<Eye className="h-4 w-4" />} onClick={() => setShowPreview((v) => !v)}>
            {showPreview ? "Hide email preview" : "Preview first email"}
          </Button>
          <Button type="submit" loading={submitting}>
            {submitLabel}
          </Button>
        </div>
        {showPreview ? (
          <div className="lg:hidden">
            <EmailPreview email={preview} compact />
          </div>
        ) : null}
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-20 space-y-3">
          <div>
            <p className="text-sm font-semibold text-ink-900">First follow-up preview</p>
            <p className="text-sm text-ink-500">Updates as you type. Sent {values.schedule[0] || "2"} days after the quote.</p>
          </div>
          <EmailPreview email={preview} compact />
        </div>
      </aside>
    </form>
  );
}
