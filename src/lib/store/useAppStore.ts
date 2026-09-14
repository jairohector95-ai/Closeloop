"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Account, BusinessType, ISODate, QuoteInput, Settings, Tone, WorkspaceData } from "../types";
import { DEFAULT_SCHEDULE, STORAGE_KEY, TRIAL_DAYS } from "../constants";
import { addDays, todayISO } from "../utils/date";
import { createId } from "../utils/id";
import { createContext } from "../domain/context";
import * as quotes from "../domain/quotes";
import * as status from "../domain/status";
import { runAutomation, type FiredFollowUp } from "../domain/automation";
import { getEmailProvider } from "../email/provider";
import { buildDemoPlatformAccounts, buildDemoWorkspace } from "../demo/seed";
import type { PlatformAccount } from "../metrics";
import { createLocalStorageAdapter } from "../persistence/adapter";

export interface OnboardingInput {
  businessName: string;
  ownerName: string;
  email: string;
  type: BusinessType;
  tone: Tone;
  loadDemoData: boolean;
}

export interface AutomationRunSummary {
  ranOn: ISODate;
  ranAt: string;
  fired: FiredFollowUp[];
  checked: number;
}

interface AppState {
  hydrated: boolean;
  account: Account | null;
  data: WorkspaceData;
  demoAccounts: PlatformAccount[];
  /** When set, the app behaves as if today were this date. Null = real today. */
  simulatedDate: ISODate | null;
  lastRun: AutomationRunSummary | null;

  // Derived helpers
  today: () => ISODate;

  // Account
  completeOnboarding: (input: OnboardingInput) => void;
  updateBusiness: (patch: Partial<Pick<Account["business"], "name" | "ownerName" | "email" | "type">>) => void;
  updateSettings: (patch: Partial<Omit<Settings, "businessId">>) => void;

  // Quotes
  addQuote: (input: QuoteInput) => string;
  updateQuote: (id: string, input: QuoteInput) => void;
  deleteQuote: (id: string) => void;
  markReplied: (id: string) => void;
  markWon: (id: string) => void;
  markLost: (id: string) => void;
  pauseQuote: (id: string) => void;
  resumeQuote: (id: string) => void;
  reopenQuote: (id: string) => void;

  // Automation & simulation
  runAutomation: () => AutomationRunSummary;
  advanceDay: (days?: number) => AutomationRunSummary;
  resetClock: () => void;
  clearLastRun: () => void;

  // Demo / maintenance
  loadDemoData: () => void;
  clearDemoData: () => void;
  resetWorkspace: () => void;
  setHydrated: (value: boolean) => void;
}

const EMPTY_DATA: WorkspaceData = { customers: [], quotes: [], followUps: [], timeline: [] };

const emailProvider = getEmailProvider();

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
      const ctx = () => {
        const { account } = get();
        if (!account) throw new Error("No account. Complete onboarding first.");
        return createContext(account.business, account.settings, get().today());
      };

      const mutate = (fn: (data: WorkspaceData) => WorkspaceData) => set((s) => ({ data: fn(s.data) }));

      return {
        hydrated: false,
        account: null,
        data: EMPTY_DATA,
        demoAccounts: [],
        simulatedDate: null,
        lastRun: null,

        today: () => get().simulatedDate ?? todayISO(),

        completeOnboarding: (input) => {
          const now = new Date().toISOString();
          const today = todayISO();
          const userId = createId("user");
          const businessId = createId("biz");
          const account: Account = {
            user: { id: userId, name: input.ownerName.trim(), email: input.email.trim().toLowerCase(), createdAt: now },
            business: {
              id: businessId,
              ownerUserId: userId,
              name: input.businessName.trim(),
              ownerName: input.ownerName.trim(),
              email: input.email.trim().toLowerCase(),
              type: input.type,
              createdAt: now,
            },
            settings: { businessId, defaultSchedule: [...DEFAULT_SCHEDULE], defaultTone: input.tone, signature: "" },
            subscription: {
              id: createId("sub"),
              businessId,
              plan: "trial",
              status: "trialing",
              stripeCustomerId: null,
              stripeSubscriptionId: null,
              trialEndsAt: new Date(addDays(today, TRIAL_DAYS)).toISOString(),
              createdAt: now,
            },
          };
          set({
            account,
            data: input.loadDemoData ? buildDemoWorkspace(account, today) : EMPTY_DATA,
            demoAccounts: buildDemoPlatformAccounts(today),
            simulatedDate: null,
            lastRun: null,
          });
        },

        updateBusiness: (patch) =>
          set((s) =>
            s.account
              ? {
                  account: {
                    ...s.account,
                    business: { ...s.account.business, ...patch },
                    user: { ...s.account.user, name: patch.ownerName ?? s.account.user.name, email: patch.email ?? s.account.user.email },
                  },
                }
              : {},
          ),

        updateSettings: (patch) =>
          set((s) => (s.account ? { account: { ...s.account, settings: { ...s.account.settings, ...patch } } } : {})),

        addQuote: (input) => {
          const result = quotes.addQuote(get().data, input, ctx());
          set({ data: result.data });
          return result.quote.id;
        },
        updateQuote: (id, input) => mutate((d) => quotes.updateQuote(d, id, input, ctx())),
        deleteQuote: (id) => mutate((d) => quotes.deleteQuote(d, id)),
        markReplied: (id) => mutate((d) => status.markReplied(d, id, ctx())),
        markWon: (id) => mutate((d) => status.markWon(d, id, ctx())),
        markLost: (id) => mutate((d) => status.markLost(d, id, ctx())),
        pauseQuote: (id) => mutate((d) => status.pauseQuote(d, id, ctx())),
        resumeQuote: (id) => mutate((d) => status.resumeQuote(d, id, ctx())),
        reopenQuote: (id) => mutate((d) => status.reopenQuote(d, id, ctx())),

        runAutomation: () => {
          const context = ctx();
          const result = runAutomation(get().data, context);
          // Phase 1: the simulated provider records the message and never sends anything.
          result.fired.forEach((f) => void emailProvider.send(f.message));
          const summary: AutomationRunSummary = {
            ranOn: context.today,
            ranAt: new Date().toISOString(),
            fired: result.fired,
            checked: result.checked,
          };
          set({ data: result.data, lastRun: summary });
          return summary;
        },

        // Steps the simulated calendar forward one day at a time, running the
        // engine each day exactly like the Phase 2 daily job will.
        advanceDay: (days = 1) => {
          const fired: FiredFollowUp[] = [];
          let checked = 0;
          let summary: AutomationRunSummary | null = null;
          for (let i = 0; i < days; i += 1) {
            set({ simulatedDate: addDays(get().today(), 1) });
            summary = get().runAutomation();
            fired.push(...summary.fired);
            checked = summary.checked;
          }
          const combined: AutomationRunSummary = {
            ranOn: get().today(),
            ranAt: new Date().toISOString(),
            fired,
            checked,
          };
          set({ lastRun: combined });
          return combined;
        },

        resetClock: () => set({ simulatedDate: null, lastRun: null }),
        clearLastRun: () => set({ lastRun: null }),

        loadDemoData: () => {
          const { account, data } = get();
          if (!account) return;
          const demo = buildDemoWorkspace(account, get().today());
          set({
            data: {
              customers: [...data.customers, ...demo.customers],
              quotes: [...data.quotes, ...demo.quotes],
              followUps: [...data.followUps, ...demo.followUps],
              timeline: [...data.timeline, ...demo.timeline],
            },
          });
        },

        clearDemoData: () =>
          set((s) => {
            const demoQuoteIds = new Set(s.data.quotes.filter((q) => q.isDemo).map((q) => q.id));
            const remainingQuotes = s.data.quotes.filter((q) => !demoQuoteIds.has(q.id));
            const usedCustomers = new Set(remainingQuotes.map((q) => q.customerId));
            return {
              data: {
                customers: s.data.customers.filter((c) => usedCustomers.has(c.id)),
                quotes: remainingQuotes,
                followUps: s.data.followUps.filter((f) => !demoQuoteIds.has(f.quoteId)),
                timeline: s.data.timeline.filter((e) => !demoQuoteIds.has(e.quoteId)),
              },
              lastRun: null,
            };
          }),

        resetWorkspace: () => set({ account: null, data: EMPTY_DATA, demoAccounts: [], simulatedDate: null, lastRun: null }),
        setHydrated: (value) => set({ hydrated: value }),
      };
    },
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => createLocalStorageAdapter()),
      partialize: (s) => ({
        account: s.account,
        data: s.data,
        demoAccounts: s.demoAccounts,
        simulatedDate: s.simulatedDate,
        lastRun: s.lastRun,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);

/** True once the persisted state has been read from storage (client only). */
export function useHydrated(): boolean {
  return useAppStore((s) => s.hydrated);
}
