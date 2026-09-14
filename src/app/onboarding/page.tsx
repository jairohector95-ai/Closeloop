"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import type { BusinessType, Tone } from "@/lib/types";
import { BUSINESS_TYPES, DEFAULT_SCHEDULE, DEFAULT_TONE } from "@/lib/constants";
import { useAppStore } from "@/lib/store/useAppStore";
import { renderFollowUpEmail } from "@/lib/email/templates";
import { validateOnboarding, type FieldErrors, type OnboardingValues } from "@/lib/validation";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { TonePicker } from "@/components/app/TonePicker";
import { EmailPreview } from "@/components/app/EmailPreview";
import { cn } from "@/lib/utils/cn";

const STEPS = ["Your business", "Your voice", "Ready"];

export default function OnboardingPage() {
  const router = useRouter();
  const hydrated = useAppStore((s) => s.hydrated);
  const hasAccount = useAppStore((s) => s.account !== null);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);

  const [step, setStep] = useState(0);
  const [values, setValues] = useState({ businessName: "", ownerName: "", email: "", type: "painting" as BusinessType });
  const [tone, setTone] = useState<Tone>(DEFAULT_TONE);
  const [loadDemo, setLoadDemo] = useState(true);
  const [errors, setErrors] = useState<FieldErrors<OnboardingValues>>({});
  const [submitting, setSubmitting] = useState(false);

  // Already onboarded? Go straight to the dashboard.
  useEffect(() => {
    if (hydrated && hasAccount && !submitting) router.replace("/dashboard");
  }, [hydrated, hasAccount, router, submitting]);

  const next = () => {
    if (step === 0) {
      const e = validateOnboarding(values);
      setErrors(e);
      if (Object.keys(e).length) return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const finish = () => {
    setSubmitting(true);
    completeOnboarding({ ...values, tone, loadDemoData: loadDemo });
    router.push("/dashboard");
  };

  const preview = renderFollowUpEmail({
    customerName: "Sarah Mitchell",
    businessName: values.businessName || "Your business",
    ownerName: values.ownerName || "You",
    serviceDescription: BUSINESS_TYPES.find((t) => t.id === values.type)?.label.toLowerCase() === "other service business" ? "the project" : `${BUSINESS_TYPES.find((t) => t.id === values.type)?.label.toLowerCase()} project`,
    amount: 2850,
    quoteNumber: "EST-1041",
    sequenceNumber: 1,
    sequenceLength: DEFAULT_SCHEDULE.length,
    tone,
  });

  return (
    <div className="flex min-h-screen flex-col bg-ink-50">
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <Logo />
        <ol className="hidden items-center gap-2 text-sm sm:flex" aria-label="Progress">
          {STEPS.map((label, i) => (
            <li key={label} className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                  i < step ? "bg-success-600 text-white" : i === step ? "bg-ink-900 text-white" : "bg-ink-200 text-ink-500",
                )}
              >
                {i < step ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
              </span>
              <span className={cn(i === step ? "font-medium text-ink-900" : "text-ink-500")}>{label}</span>
              {i < STEPS.length - 1 ? <span className="mx-1 h-px w-8 bg-ink-200" aria-hidden="true" /> : null}
            </li>
          ))}
        </ol>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-4 sm:px-6 sm:pt-8">
        <div className="w-full max-w-xl">
          {step === 0 ? (
            <section className="rise rounded-2xl border border-ink-200 bg-white p-6 shadow-card sm:p-8">
              <p className="text-sm font-medium text-brand-700">Step 1 of 3</p>
              <h1 className="font-display mt-1 text-2xl font-semibold text-ink-900 sm:text-3xl">Tell us about your business</h1>
              <p className="mt-2 text-[15px] text-ink-500">This is how CloseLoop introduces you in follow-up emails. Takes about a minute.</p>
              <form
                className="mt-7 space-y-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  next();
                }}
                noValidate
              >
                <Field label="Business name" htmlFor="businessName" error={errors.businessName}>
                  <Input id="businessName" autoFocus value={values.businessName} onChange={(e) => setValues({ ...values, businessName: e.target.value })} placeholder="ABC Painting" error={errors.businessName} />
                </Field>
                <Field label="Your name" htmlFor="ownerName" error={errors.ownerName} hint="Emails are signed with this.">
                  <Input id="ownerName" value={values.ownerName} onChange={(e) => setValues({ ...values, ownerName: e.target.value })} placeholder="Mike Turner" error={errors.ownerName} />
                </Field>
                <Field label="Business email" htmlFor="email" error={errors.email} hint="Where customer replies should go.">
                  <Input id="email" type="email" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} placeholder="mike@abcpainting.com" error={errors.email} />
                </Field>
                <Field label="What kind of work do you do?" htmlFor="type">
                  <Select id="type" value={values.type} onChange={(e) => setValues({ ...values, type: e.target.value as BusinessType })}>
                    {BUSINESS_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="flex justify-end pt-2">
                  <Button type="submit" size="lg" icon={<ArrowRight className="h-4 w-4" />}>
                    Continue
                  </Button>
                </div>
              </form>
            </section>
          ) : null}

          {step === 1 ? (
            <section className="rise rounded-2xl border border-ink-200 bg-white p-6 shadow-card sm:p-8">
              <p className="text-sm font-medium text-brand-700">Step 2 of 3</p>
              <h1 className="font-display mt-1 text-2xl font-semibold text-ink-900 sm:text-3xl">How should your follow-ups sound?</h1>
              <p className="mt-2 text-[15px] text-ink-500">Pick the voice closest to how you already talk to customers. You can change it any time.</p>
              <div className="mt-7">
                <TonePicker value={tone} onChange={setTone} />
              </div>
              <div className="mt-6">
                <p className="mb-2 text-sm font-medium text-ink-800">Here&apos;s how your first follow-up would read</p>
                <EmailPreview email={preview} compact />
              </div>
              <div className="mt-7 flex items-center justify-between">
                <Button type="button" variant="ghost" onClick={() => setStep(0)} icon={<ArrowLeft className="h-4 w-4" />}>
                  Back
                </Button>
                <Button type="button" size="lg" onClick={next} icon={<ArrowRight className="h-4 w-4" />}>
                  Continue
                </Button>
              </div>
            </section>
          ) : null}

          {step === 2 ? (
            <section className="rise rounded-2xl border border-ink-200 bg-white p-6 shadow-card sm:p-8">
              <p className="text-sm font-medium text-brand-700">Step 3 of 3</p>
              <h1 className="font-display mt-1 text-2xl font-semibold text-ink-900 sm:text-3xl">You&apos;re set, {values.ownerName.split(" ")[0]}.</h1>
              <p className="mt-2 text-[15px] text-ink-500">Here&apos;s what happens from now on:</p>
              <ol className="mt-6 space-y-4">
                {[
                  ["Add an estimate you've sent", "Customer, amount, date sent. Thirty seconds."],
                  ["CloseLoop follows up", `Day ${DEFAULT_SCHEDULE.join(", day ")} after the quote, in your ${tone} voice.`],
                  ["It stops when they reply", "Mark the quote replied, won or lost and nothing else goes out."],
                ].map(([title, detail], i) => (
                  <li key={title} className="flex gap-4">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-900 font-display text-sm font-semibold text-white">{i + 1}</span>
                    <div>
                      <p className="font-medium text-ink-900">{title}</p>
                      <p className="text-sm text-ink-500">{detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <label className="mt-7 flex cursor-pointer items-start gap-3 rounded-xl border border-ink-200 bg-ink-50/60 px-4 py-3.5">
                <input type="checkbox" checked={loadDemo} onChange={(e) => setLoadDemo(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-ink-300 accent-ink-900" />
                <span>
                  <span className="block text-sm font-medium text-ink-900">Start with sample quotes</span>
                  <span className="block text-sm text-ink-500">A dozen fictional estimates so you can see the dashboard in action. Remove them any time from Settings.</span>
                </span>
              </label>
              <div className="mt-7 flex items-center justify-between">
                <Button type="button" variant="ghost" onClick={() => setStep(1)} icon={<ArrowLeft className="h-4 w-4" />}>
                  Back
                </Button>
                <Button type="button" size="lg" onClick={finish} loading={submitting} icon={<ArrowRight className="h-4 w-4" />}>
                  Open my dashboard
                </Button>
              </div>
            </section>
          ) : null}
        </div>
      </main>
    </div>
  );
}
