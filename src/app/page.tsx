import Link from "next/link";
import { ArrowRight, BellOff, CalendarCheck, Check, Clock, FilePlus2, MailCheck, Repeat, ShieldCheck, Smartphone } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { HeroMock } from "@/components/marketing/HeroMock";
import { SequenceDemo } from "@/components/marketing/SequenceDemo";
import { FAQ } from "@/components/marketing/FAQ";
import { PLANS, DEFAULT_SCHEDULE } from "@/lib/constants";
import { formatMoney } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import { signInHref, startHref } from "@/lib/server/mode";

const TRADES = ["Painters", "Pressure washers", "Landscapers", "Cleaners", "Pool companies", "Roofers", "Handymen", "Flooring", "HVAC", "Plumbers", "Electricians", "Remodelers"];

export default function HomePage() {
  return (
    <div className="bg-white text-ink-800">
      <MarketingNav />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="hero-grid absolute inset-x-0 top-0 h-[560px]" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-8 lg:pb-28 lg:pt-24">
          <div>
            <p className="rise inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-3 py-1 text-xs font-medium text-ink-600">
              <span className="h-1.5 w-1.5 rounded-full bg-success-600" /> For contractors and local service businesses
            </p>
            <h1 className="rise rise-1 font-display mt-5 text-[2.5rem] font-semibold leading-[1.05] text-ink-900 sm:text-5xl lg:text-[3.6rem]">
              Stop losing jobs because you forgot to follow up.
            </h1>
            <p className="rise rise-2 mt-5 max-w-xl text-lg leading-relaxed text-ink-600">
              CloseLoop automatically follows up on estimates you&apos;ve already sent, so more customers reply and fewer jobs slip through the cracks.
            </p>
            <div className="rise rise-3 mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href={startHref()} size="lg" icon={<ArrowRight className="h-4 w-4" />}>
                Start free
              </ButtonLink>
              <ButtonLink href="#how-it-works" variant="outline" size="lg">
                See how it works
              </ButtonLink>
            </div>
            <ol className="rise rise-4 mt-10 flex flex-col gap-3 text-sm text-ink-600 sm:flex-row sm:gap-8">
              {["Add your estimate", "CloseLoop follows up", "Stops when they reply"].map((step, i) => (
                <li key={step} className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-900 font-display text-[11px] font-semibold text-white">{i + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
          <HeroMock />
        </div>
      </section>

      {/* Trades */}
      <section className="border-y border-ink-100 bg-ink-50/60">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <p className="text-center text-xs font-medium uppercase tracking-wide text-ink-400">Built for the trades</p>
          <ul className="mt-3 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-medium text-ink-600">
            {TRADES.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* Problem */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="text-sm font-medium text-brand-700">The problem</p>
            <h2 className="font-display mt-2 text-3xl font-semibold text-ink-900 sm:text-4xl">The quote goes out. Then life happens.</h2>
          </div>
          <div className="space-y-6 text-[17px] leading-relaxed text-ink-600">
            <p>You send an estimate. The customer says &ldquo;let me think about it.&rdquo; You&apos;re on a ladder by 7 the next morning, and by the time you remember, a week has gone by.</p>
            <p>Most of those customers weren&apos;t saying no. They were busy too. They just needed a nudge, and the contractor who nudged got the job.</p>
            <p className="font-medium text-ink-900">Following up isn&apos;t hard. Remembering to is.</p>
          </div>
        </div>
      </section>

      {/* Solution */}
      <section className="bg-ink-900 text-white">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-brand-300">The solution</p>
            <h2 className="font-display mt-2 text-3xl font-semibold sm:text-4xl">CloseLoop remembers for you.</h2>
            <p className="mt-4 text-lg leading-relaxed text-ink-300">
              Add a quote once. CloseLoop sends a short, human follow-up on the days you choose, in your voice, and stops the moment the customer replies. You get on with the work.
            </p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {[
              { icon: Clock, title: "Set it once", text: "Default schedule is day 2, day 5 and day 10. Change it per quote or for everything." },
              { icon: MailCheck, title: "Sounds like you", text: "Friendly, professional or direct. Written from your name and business, never a robot." },
              { icon: BellOff, title: "Knows when to stop", text: "Replied, won, lost or paused: the sequence ends. No customer ever gets a follow-up they shouldn't." },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
                <item.icon className="h-5 w-5 text-brand-300" />
                <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-ink-300">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 lg:py-28">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-brand-700">How it works</p>
          <h2 className="font-display mt-2 text-3xl font-semibold text-ink-900 sm:text-4xl">Three steps. About thirty seconds.</h2>
        </div>
        <ol className="mt-12 grid gap-8 md:grid-cols-3">
          {[
            {
              icon: FilePlus2,
              title: "Add your estimate",
              text: "Customer name, email, what the job is, how much, and when you sent it. That's the whole form.",
            },
            {
              icon: Repeat,
              title: "CloseLoop follows up",
              text: `On day ${DEFAULT_SCHEDULE.join(", ")} after the quote, a short email goes out in your voice asking if they have questions or want to book.`,
            },
            {
              icon: CalendarCheck,
              title: "Stop automatically when they reply",
              text: "The moment a customer gets back to you, mark the quote replied and the loop closes. Then mark it won.",
            },
          ].map((step, i) => (
            <li key={step.title} className="relative rounded-2xl border border-ink-200 p-6 shadow-card">
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-100 text-ink-700">
                  <step.icon className="h-5 w-5" />
                </span>
                <span className="font-display text-3xl font-semibold text-ink-200">{i + 1}</span>
              </div>
              <h3 className="mt-5 text-lg font-semibold text-ink-900">{step.title}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-ink-600">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Example sequence */}
      <section id="example" className="scroll-mt-20 border-y border-ink-100 bg-ink-50/60">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-brand-700">Example follow-up sequence</p>
            <h2 className="font-display mt-2 text-3xl font-semibold text-ink-900 sm:text-4xl">Short, polite, and written like a person.</h2>
            <p className="mt-3 text-lg text-ink-600">This is the actual email engine. Try the tones.</p>
          </div>
          <div className="mt-10">
            <SequenceDemo />
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-brand-700">Why contractors use it</p>
          <h2 className="font-display mt-2 text-3xl font-semibold text-ink-900 sm:text-4xl">Win the jobs you already quoted.</h2>
        </div>
        <div className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: Repeat, title: "Every quote gets followed up", text: "Not just the ones you remember on a slow day." },
            { icon: ShieldCheck, title: "Never pushy", text: "Three gentle emails over ten days, then it stops. Customers stay happy." },
            { icon: Clock, title: "Zero admin", text: "No spreadsheets, no reminders on your phone, no sticky notes on the dash." },
            { icon: MailCheck, title: "Sounds like you wrote it", text: "Emails come from your name and business, in the tone you choose." },
            { icon: Smartphone, title: "Works on your phone", text: "Add a quote from the truck before you pull out of the driveway." },
            { icon: CalendarCheck, title: "See what's working", text: "Quotes waiting, replies, jobs won and revenue recovered, at a glance." },
          ].map((b) => (
            <div key={b.title} className="flex gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                <b.icon className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-semibold text-ink-900">{b.title}</h3>
                <p className="mt-1 text-[15px] leading-relaxed text-ink-600">{b.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-20 border-t border-ink-100 bg-ink-50/60">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-medium text-brand-700">Pricing</p>
            <h2 className="font-display mt-2 text-3xl font-semibold text-ink-900 sm:text-4xl">One recovered job pays for a year.</h2>
            <p className="mt-3 text-lg text-ink-600">Start free. Upgrade when you&apos;re following up on more quotes than the trial allows.</p>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {PLANS.map((plan) => {
              const featured = plan.id === "starter";
              return (
                <div key={plan.id} className={cn("flex flex-col rounded-2xl border bg-white p-7 shadow-card", featured ? "border-ink-900 ring-1 ring-ink-900" : "border-ink-200")}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-ink-900">{plan.name}</h3>
                    {featured ? <span className="rounded-full bg-ink-900 px-2.5 py-0.5 text-xs font-medium text-white">Most popular</span> : null}
                  </div>
                  <p className="mt-1 text-sm text-ink-500">{plan.description}</p>
                  <p className="mt-6 flex items-baseline gap-1">
                    <span className="font-display text-4xl font-semibold text-ink-900">{plan.priceMonthly === 0 ? "Free" : formatMoney(plan.priceMonthly)}</span>
                    {plan.priceMonthly > 0 ? <span className="text-sm text-ink-500">/month</span> : null}
                  </p>
                  <ul className="mt-6 space-y-2.5 text-sm text-ink-700">
                    {plan.features.map((f) => (
                      <li key={f} className="flex gap-2.5">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-success-600" strokeWidth={2.5} />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-8">
                    <ButtonLink href={startHref()} variant={featured ? "primary" : "outline"} className="w-full">
                      {plan.id === "trial" ? "Start free" : `Start with ${plan.name}`}
                    </ButtonLink>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-6 text-center text-sm text-ink-500">Prices are provisional while CloseLoop is in early access. No credit card required to start.</p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-20 sm:px-6 lg:py-28">
        <p className="text-sm font-medium text-brand-700">Questions</p>
        <h2 className="font-display mt-2 text-3xl font-semibold text-ink-900 sm:text-4xl">Fair questions, straight answers.</h2>
        <div className="mt-10">
          <FAQ />
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <div className="rounded-3xl bg-ink-900 px-6 py-14 text-center text-white sm:px-12 sm:py-20">
          <h2 className="font-display text-3xl font-semibold sm:text-4xl lg:text-5xl">The next quote you send shouldn&apos;t be the last time they hear from you.</h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-ink-300">Set up takes a minute. Add one estimate and watch CloseLoop take it from there.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink href={startHref()} size="lg" variant="inverted" icon={<ArrowRight className="h-4 w-4" />}>
              Start free
            </ButtonLink>
            <ButtonLink href="#how-it-works" size="lg" variant="ghost" className="text-white hover:bg-white/10">
              See how it works
            </ButtonLink>
          </div>
        </div>
      </section>

      <footer className="border-t border-ink-100">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <Logo />
            <p className="mt-2 text-sm text-ink-500">Automatic follow-ups for estimates. Built for the trades.</p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-600" aria-label="Footer">
            <a href="#how-it-works" className="hover:text-ink-900">
              How it works
            </a>
            <a href="#pricing" className="hover:text-ink-900">
              Pricing
            </a>
            <a href="#faq" className="hover:text-ink-900">
              FAQ
            </a>
            <Link href={signInHref()} className="hover:text-ink-900">
              Sign in
            </Link>
          </nav>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-8 text-xs text-ink-400 sm:px-6">© {new Date().getFullYear()} CloseLoop. Early access.</div>
      </footer>
    </div>
  );
}
