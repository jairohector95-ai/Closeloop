"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Database, Mail, Plug, RotateCcw, Trash2 } from "lucide-react";
import type { BusinessType, Tone } from "@/lib/types";
import { BUSINESS_TYPES, PLANS, TRIAL_DAYS, planById } from "@/lib/constants";
import { useAppStore } from "@/lib/store/useAppStore";
import { renderFollowUpEmail } from "@/lib/email/templates";
import { validateOnboarding, type FieldErrors, type OnboardingValues } from "@/lib/validation";
import { normalizeSchedule } from "@/lib/domain/quotes";
import { formatLong } from "@/lib/utils/date";
import { formatMoney } from "@/lib/utils/money";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { TonePicker } from "@/components/app/TonePicker";
import { ScheduleEditor } from "@/components/app/ScheduleEditor";
import { EmailPreview } from "@/components/app/EmailPreview";
import { cn } from "@/lib/utils/cn";

const SECTIONS = [
  { id: "profile", label: "Business profile" },
  { id: "schedule", label: "Follow-up schedule" },
  { id: "tone", label: "Email tone" },
  { id: "preview", label: "Email preview" },
  { id: "billing", label: "Billing" },
  { id: "integrations", label: "Integrations" },
  { id: "data", label: "Demo data" },
];

export default function SettingsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const account = useAppStore((s) => s.account);
  const quotes = useAppStore((s) => s.data.quotes);
  const updateBusiness = useAppStore((s) => s.updateBusiness);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const clearDemoData = useAppStore((s) => s.clearDemoData);
  const loadDemoData = useAppStore((s) => s.loadDemoData);
  const resetWorkspace = useAppStore((s) => s.resetWorkspace);

  const [profile, setProfile] = useState(() => ({
    businessName: account?.business.name ?? "",
    ownerName: account?.business.ownerName ?? "",
    email: account?.business.email ?? "",
    type: account?.business.type ?? ("other" as BusinessType),
  }));
  const [profileErrors, setProfileErrors] = useState<FieldErrors<OnboardingValues>>({});
  const [schedule, setSchedule] = useState<string[]>(() => (account?.settings.defaultSchedule ?? [2, 5, 10]).map(String));
  const [scheduleError, setScheduleError] = useState<string | undefined>();
  const [signature, setSignature] = useState(account?.settings.signature ?? "");
  const [previewStep, setPreviewStep] = useState(1);
  const [confirmReset, setConfirmReset] = useState(false);

  if (!account) return null;

  const demoCount = quotes.filter((q) => q.isDemo).length;
  const plan = planById(account.subscription.plan);
  const tone = account.settings.defaultTone;

  const saveProfile = () => {
    const errors = validateOnboarding(profile);
    setProfileErrors(errors);
    if (Object.keys(errors).length) return;
    updateBusiness({ name: profile.businessName.trim(), ownerName: profile.ownerName.trim(), email: profile.email.trim(), type: profile.type });
    toast({ kind: "success", title: "Business profile saved" });
  };

  const saveSchedule = () => {
    const nums = schedule.map(Number);
    if (nums.some((n) => !Number.isInteger(n) || n < 1 || n > 90)) {
      setScheduleError("Each follow-up must be between 1 and 90 days after the quote.");
      return;
    }
    if (nums.some((n, i) => i > 0 && n <= nums[i - 1])) {
      setScheduleError("Follow-ups must be in increasing order.");
      return;
    }
    setScheduleError(undefined);
    const normalized = normalizeSchedule(nums);
    updateSettings({ defaultSchedule: normalized });
    setSchedule(normalized.map(String));
    toast({ kind: "success", title: "Default schedule saved", description: "New quotes will use this sequence. Existing quotes keep theirs." });
  };

  const preview = renderFollowUpEmail({
    customerName: "Sarah Mitchell",
    businessName: profile.businessName || account.business.name,
    ownerName: profile.ownerName || account.business.ownerName,
    serviceDescription: "Interior painting, 3 bedrooms",
    amount: 2850,
    quoteNumber: "EST-2026-1041",
    sequenceNumber: previewStep,
    sequenceLength: schedule.length || 3,
    tone,
    signature,
  });

  return (
    <div>
      <PageHeader title="Settings" description="How CloseLoop represents your business." />
      <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
        <nav className="hidden lg:block">
          <ul className="sticky top-24 space-y-0.5 text-sm">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="block rounded-lg px-3 py-2 text-ink-600 hover:bg-ink-100 hover:text-ink-900">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-6">
          <Card id="profile">
            <CardHeader title="Business profile" description="Shown in the emails your customers receive." />
            <CardBody className="grid gap-5 sm:grid-cols-2">
              <Field label="Business name" htmlFor="businessName" error={profileErrors.businessName}>
                <Input id="businessName" value={profile.businessName} onChange={(e) => setProfile({ ...profile, businessName: e.target.value })} error={profileErrors.businessName} />
              </Field>
              <Field label="Your name" htmlFor="ownerName" error={profileErrors.ownerName} hint="Signs off every email.">
                <Input id="ownerName" value={profile.ownerName} onChange={(e) => setProfile({ ...profile, ownerName: e.target.value })} error={profileErrors.ownerName} />
              </Field>
              <Field label="Business email" htmlFor="email" error={profileErrors.email} hint="Customer replies will land here.">
                <Input id="email" type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} error={profileErrors.email} />
              </Field>
              <Field label="Business type" htmlFor="type">
                <Select id="type" value={profile.type} onChange={(e) => setProfile({ ...profile, type: e.target.value as BusinessType })}>
                  {BUSINESS_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="sm:col-span-2 flex justify-end">
                <Button onClick={saveProfile}>Save profile</Button>
              </div>
            </CardBody>
          </Card>

          <Card id="schedule">
            <CardHeader title="Default follow-up schedule" description="Used for new quotes. You can still adjust each quote individually." />
            <CardBody className="space-y-5">
              <ScheduleEditor value={schedule} onChange={setSchedule} error={scheduleError} />
              <div className="flex justify-end">
                <Button onClick={saveSchedule}>Save schedule</Button>
              </div>
            </CardBody>
          </Card>

          <Card id="tone">
            <CardHeader title="Default email tone" description="Pick the voice that sounds like you. Changes apply to new quotes." />
            <CardBody>
              <TonePicker
                value={tone}
                onChange={(next: Tone) => {
                  updateSettings({ defaultTone: next });
                  toast({ kind: "success", title: `Tone set to ${next}` });
                }}
              />
            </CardBody>
          </Card>

          <Card id="preview">
            <CardHeader
              title="Email preview"
              description="Exactly what a customer would see, using a sample quote."
              action={
                <div className="flex gap-1 rounded-lg bg-ink-100 p-0.5">
                  {Array.from({ length: schedule.length || 3 }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPreviewStep(n)}
                      className={cn("rounded-md px-2.5 py-1 text-xs font-medium", previewStep === n ? "bg-white text-ink-900 shadow-card" : "text-ink-500 hover:text-ink-800")}
                    >
                      #{n}
                    </button>
                  ))}
                </div>
              }
            />
            <CardBody className="space-y-5">
              <EmailPreview email={preview} to="sarah.mitchell@example.com" from={`${profile.ownerName || account.business.ownerName} at ${profile.businessName || account.business.name}`} />
              <Field label="Signature line" htmlFor="signature" optional hint="Added under your name, e.g. a phone number or website.">
                <div className="flex gap-2">
                  <Input id="signature" value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="(555) 100-2000 · abcpainting.com" />
                  <Button
                    variant="outline"
                    onClick={() => {
                      updateSettings({ signature: signature.trim() });
                      toast({ kind: "success", title: "Signature saved" });
                    }}
                  >
                    Save
                  </Button>
                </div>
              </Field>
            </CardBody>
          </Card>

          <Card id="billing">
            <CardHeader
              title={
                <span className="inline-flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-ink-400" /> Billing
                </span>
              }
              description="Coming in Phase 2."
              action={<Badge tone="brand">{plan.name}</Badge>}
            />
            <CardBody className="space-y-4">
              <div className="rounded-xl border border-dashed border-ink-200 bg-ink-50/60 px-5 py-4 text-sm text-ink-600">
                You&apos;re on the <strong className="font-medium text-ink-900">{plan.name}</strong>
                {account.subscription.trialEndsAt ? <> until {formatLong(account.subscription.trialEndsAt)} ({TRIAL_DAYS} days)</> : null}. Payments and plan changes will be handled by Stripe in Phase 2. Nothing is charged today.
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {PLANS.map((p) => (
                  <div key={p.id} className={cn("rounded-xl border px-4 py-3.5", p.id === plan.id ? "border-ink-900" : "border-ink-200")}>
                    <p className="text-sm font-semibold text-ink-900">{p.name}</p>
                    <p className="mt-0.5 text-sm text-ink-600">
                      {p.priceMonthly === 0 ? "Free" : `${formatMoney(p.priceMonthly)}/month`}
                      {p.activeFollowUpLimit ? <span className="text-ink-400"> · {p.activeFollowUpLimit} active</span> : null}
                    </p>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          <Card id="integrations">
            <CardHeader
              title={
                <span className="inline-flex items-center gap-2">
                  <Plug className="h-4 w-4 text-ink-400" /> Integrations
                </span>
              }
              description="Planned for Phase 2. Nothing to set up yet."
            />
            <CardBody>
              <ul className="divide-y divide-ink-100">
                {[
                  { name: "Gmail", detail: "Send follow-ups from your own inbox and detect replies automatically.", icon: Mail },
                  { name: "Outlook", detail: "Same as Gmail, for Microsoft 365 accounts.", icon: Mail },
                  { name: "Stripe", detail: "Subscription billing for your CloseLoop plan.", icon: CreditCard },
                ].map((item) => (
                  <li key={item.name} className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink-100 text-ink-600">
                      <item.icon className="h-4.5 w-4.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink-900">{item.name}</p>
                      <p className="text-sm text-ink-500">{item.detail}</p>
                    </div>
                    <Badge tone="neutral">Coming soon</Badge>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <Card id="data">
            <CardHeader
              title={
                <span className="inline-flex items-center gap-2">
                  <Database className="h-4 w-4 text-ink-400" /> Demo data
                </span>
              }
              description="Sample quotes so you can explore. Everything is stored in this browser only."
            />
            <CardBody className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {demoCount > 0 ? (
                <Button
                  variant="outline"
                  icon={<Trash2 className="h-4 w-4" />}
                  onClick={() => {
                    clearDemoData();
                    toast({ kind: "info", title: "Demo quotes removed", description: "Your own quotes were kept." });
                  }}
                >
                  Remove {demoCount} demo quotes
                </Button>
              ) : (
                <Button
                  variant="outline"
                  icon={<Database className="h-4 w-4" />}
                  onClick={() => {
                    loadDemoData();
                    toast({ kind: "success", title: "Demo quotes added" });
                  }}
                >
                  Load demo quotes
                </Button>
              )}
              <Button variant="ghost" className="text-danger-700 hover:bg-danger-50" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setConfirmReset(true)}>
                Reset everything
              </Button>
            </CardBody>
          </Card>
        </div>
      </div>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset CloseLoop?"
        description="This removes your business profile and every quote from this browser and takes you back to onboarding."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                resetWorkspace();
                router.push("/onboarding");
              }}
            >
              Reset everything
            </Button>
          </>
        }
      />
    </div>
  );
}
