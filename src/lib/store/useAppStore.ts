"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Account, BusinessType, ISODate, QuoteInput, Settings, Tone, WorkspaceData } from "../types";
import { DEFAULT_SCHEDULE, STORAGE_KEY, TRIAL_DAYS } from "../constants";
import { addDays, todayISO } from "../utils/date";
import { createId, createSecureToken } from "../utils/id";
import { createContext } from "../domain/context";
import * as quotes from "../domain/quotes";
import * as status from "../domain/status";
import { retryFollowUp, runAutomation, type FiredFollowUp } from "../domain/automation";
import { recordInboundEmail, type InboundEmailInput } from "../domain/replies";
import { getEmailProvider } from "../email/provider";
import { buildDemoPlatformAccounts, buildDemoWorkspace } from "../demo/seed";
import type { PlatformAccount } from "../metrics";
import { createLocalStorageAdapter, createMemoryAdapter } from "../persistence/adapter";
import { diffWorkspace } from "../persistence/repository";
import { isCloudMode } from "../server/mode";
import { remote, SyncQueue, type RemoteWorkspace } from "./remote";

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
  /** Cloud mode: problems reported by the scheduler (e.g. email provider not configured). */
  errors?: string[];
}

export type RemoteStatus = "idle" | "loading" | "ready" | "unauthenticated" | "error";
export type SyncStatus = "idle" | "saving" | "error";

interface AppState {
  hydrated: boolean;
  mode: "local" | "cloud";
  account: Account | null;
  data: WorkspaceData;
  demoAccounts: PlatformAccount[];
  /** When set, the app behaves as if today were this date. Null = real today. Local mode only. */
  simulatedDate: ISODate | null;
  lastRun: AutomationRunSummary | null;
  /** Cloud mode: latest scheduler run for this business. */
  lastSweep: RemoteWorkspace["lastSweep"];
  remoteStatus: RemoteStatus;
  syncStatus: SyncStatus;
  syncError: string | null;

  // Derived helpers
  today: () => ISODate;

  // Cloud mode
  loadRemote: () => Promise<void>;

  // Account
  completeOnboarding: (input: OnboardingInput) => Promise<void>;
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
  retryFollowUp: (followUpId: string) => void;
  /** Logs an email the customer sent (manual entry in Phase 1; webhooks/mailbox sync later). */
  logReply: (input: InboundEmailInput) => { quoteId: string | null; stoppedSequence: boolean };

  // Automation & simulation
  runAutomation: () => Promise<AutomationRunSummary>;
  advanceDay: (days?: number) => Promise<AutomationRunSummary>;
  resetClock: () => void;
  clearLastRun: () => void;

  // Demo / maintenance
  loadDemoData: () => void;
  clearDemoData: () => void;
  resetWorkspace: () => void;
  setHydrated: (value: boolean) => void;
}

const EMPTY_DATA: WorkspaceData = { customers: [], quotes: [], followUps: [], timeline: [], inbound: [] };

const emailProvider = getEmailProvider();

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
      const ctx = () => {
        const { account } = get();
        if (!account) throw new Error("No account. Complete onboarding first.");
        return createContext(account.business, account.settings, get().today());
      };

      const syncQueue = new SyncQueue(
        (changes) => remote.pushChanges(changes),
        (status, error) => set({ syncStatus: status, syncError: error ?? null }),
      );

      /** Applies a pure domain update; in cloud mode the difference is queued for the server. */
      const mutate = (fn: (data: WorkspaceData) => WorkspaceData) => {
        const prev = get().data;
        const next = fn(prev);
        if (next === prev) return;
        set({ data: next });
        if (get().mode === "cloud") syncQueue.enqueue(diffWorkspace(prev, next));
      };

      return {
        hydrated: false,
        mode: isCloudMode ? "cloud" : "local",
        account: null,
        data: EMPTY_DATA,
        demoAccounts: [],
        simulatedDate: null,
        lastRun: null,
        lastSweep: null,
        remoteStatus: "idle",
        syncStatus: "idle",
        syncError: null,

        today: () => (get().mode === "cloud" ? todayISO() : (get().simulatedDate ?? todayISO())),

        loadRemote: async () => {
          if (get().remoteStatus === "loading") return;
          set({ remoteStatus: "loading" });
          try {
            const result = await remote.fetchWorkspace();
            set({
              account: result.account,
              data: result.data ?? EMPTY_DATA,
              lastSweep: result.lastSweep,
              demoAccounts: [],
              remoteStatus: "ready",
              hydrated: true,
            });
          } catch (error) {
            const status = error instanceof Error && "status" in error ? (error as { status: number }).status : 0;
            set({ remoteStatus: status === 401 ? "unauthenticated" : "error", hydrated: true });
          }
        },

        completeOnboarding: async (input) => {
          if (get().mode === "cloud") {
            const result = await remote.createAccount({
              businessName: input.businessName,
              ownerName: input.ownerName,
              email: input.email,
              type: input.type,
              tone: input.tone,
              loadDemoData: input.loadDemoData,
            });
            set({ account: result.account, data: result.data, remoteStatus: "ready", hydrated: true, simulatedDate: null, lastRun: null });
            return;
          }
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

        updateBusiness: (patch) => {
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
          );
          if (get().mode === "cloud") {
            set({ syncStatus: "saving" });
            remote
              .patchAccount({ business: patch })
              .then((r) => set({ account: r.account, syncStatus: "idle", syncError: null }))
              .catch((e: Error) => set({ syncStatus: "error", syncError: e.message }));
          }
        },

        updateSettings: (patch) => {
          set((s) => (s.account ? { account: { ...s.account, settings: { ...s.account.settings, ...patch } } } : {}));
          if (get().mode === "cloud") {
            set({ syncStatus: "saving" });
            remote
              .patchAccount({ settings: patch })
              .then((r) => set({ account: r.account, syncStatus: "idle", syncError: null }))
              .catch((e: Error) => set({ syncStatus: "error", syncError: e.message }));
          }
        },

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
        retryFollowUp: (followUpId) => mutate((d) => retryFollowUp(d, followUpId, ctx())),
        logReply: (input) => {
          const result = recordInboundEmail(get().data, input, ctx());
          set({ data: result.data });
          return { quoteId: result.match.quoteId, stoppedSequence: result.stoppedSequence };
        },

        runAutomation: async () => {
          if (get().mode === "cloud") {
            // The real scheduler runs server-side; "check now" triggers it for this business only.
            const report = await remote.runSweep();
            const fresh = await remote.fetchWorkspace();
            const data = fresh.data ?? get().data;
            const account = fresh.account ?? get().account;
            const fired: FiredFollowUp[] = report.sentFollowUpIds.flatMap((id) => {
              const followUp = data.followUps.find((f) => f.id === id);
              const quote = followUp ? data.quotes.find((q) => q.id === followUp.quoteId) : undefined;
              const customer = quote ? data.customers.find((c) => c.id === quote.customerId) : undefined;
              if (!followUp || !quote || !customer || !account) return [];
              return [
                {
                  quote,
                  customer,
                  followUp,
                  message: {
                    to: customer.email,
                    toName: customer.name,
                    fromName: `${account.business.name} via CloseLoop`,
                    fromAddress: "",
                    replyTo: "",
                    subject: followUp.subject ?? "",
                    body: followUp.body ?? "",
                    html: "",
                    idempotencyKey: followUp.idempotencyKey,
                    inReplyTo: null,
                    references: [],
                    threadId: null,
                    tags: {},
                  },
                },
              ];
            });
            const summary: AutomationRunSummary = { ranOn: todayISO(), ranAt: report.ranAt, fired, checked: report.attempted, errors: report.errors };
            set({ data, account, lastSweep: fresh.lastSweep, lastRun: summary });
            return summary;
          }
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
        // engine each day exactly like the production job does. Local mode only.
        advanceDay: async (days = 1) => {
          if (get().mode === "cloud") return get().runAutomation();
          const fired: FiredFollowUp[] = [];
          let checked = 0;
          let summary: AutomationRunSummary | null = null;
          for (let i = 0; i < days; i += 1) {
            set({ simulatedDate: addDays(get().today(), 1) });
            summary = await get().runAutomation();
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
          const { account } = get();
          if (!account) return;
          const demo = buildDemoWorkspace(account, get().today());
          mutate((data) => ({
            customers: [...data.customers, ...demo.customers],
            quotes: [...data.quotes, ...demo.quotes],
            followUps: [...data.followUps, ...demo.followUps],
            timeline: [...data.timeline, ...demo.timeline],
            inbound: [...data.inbound, ...demo.inbound],
          }));
        },

        clearDemoData: () => {
          mutate((data) => {
            const demoQuoteIds = new Set(data.quotes.filter((q) => q.isDemo).map((q) => q.id));
            const remainingQuotes = data.quotes.filter((q) => !demoQuoteIds.has(q.id));
            const usedCustomers = new Set(remainingQuotes.map((q) => q.customerId));
            return {
              customers: data.customers.filter((c) => usedCustomers.has(c.id)),
              quotes: remainingQuotes,
              followUps: data.followUps.filter((f) => !demoQuoteIds.has(f.quoteId)),
              timeline: data.timeline.filter((e) => !demoQuoteIds.has(e.quoteId)),
              inbound: data.inbound.filter((i) => !i.quoteId || !demoQuoteIds.has(i.quoteId)),
            };
          });
          set({ lastRun: null });
        },

        resetWorkspace: () => {
          if (get().mode === "cloud") {
            // Cloud: the account stays; every quote and its history is deleted.
            mutate(() => EMPTY_DATA);
            set({ lastRun: null });
            return;
          }
          set({ account: null, data: EMPTY_DATA, demoAccounts: [], simulatedDate: null, lastRun: null });
        },
        setHydrated: (value) => set({ hydrated: value }),
      };
    },
    {
      name: STORAGE_KEY,
      version: 3,
      // Cloud mode keeps nothing in the browser; the server is the source of truth.
      storage: createJSONStorage(() => (isCloudMode ? createMemoryAdapter() : createLocalStorageAdapter())),
      migrate: (persisted, version) => migratePersistedState(persisted, version),
      partialize: (s) =>
        s.mode === "cloud"
          ? {}
          : {
              account: s.account,
              data: s.data,
              demoAccounts: s.demoAccounts,
              simulatedDate: s.simulatedDate,
              lastRun: s.lastRun,
            },
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);

/**
 * Upgrades older localStorage snapshots. Version 1 (first MVP) had no delivery
 * bookkeeping on follow-ups, no inbound emails and no thread id on quotes.
 */
export function migratePersistedState(persisted: unknown, version: number): unknown {
  if (!persisted || typeof persisted !== "object") return persisted;
  const state = persisted as { data?: Partial<WorkspaceData> & { followUps?: Array<Record<string, unknown>>; quotes?: Array<Record<string, unknown>> } };
  if (version < 2 && state.data) {
    state.data.inbound = state.data.inbound ?? [];
    state.data.followUps = (state.data.followUps ?? []).map((f) => {
      const defaults: Record<string, unknown> = {
        idempotencyKey: `${f.quoteId}:${f.sequenceNumber}:${f.id}`,
        attempts: f.status === "sent" ? 1 : 0,
        claimedAt: null,
        nextAttemptAt: null,
        lastError: null,
        providerMessageId: f.status === "sent" ? `sim_${f.id}` : null,
        messageId: f.status === "sent" ? `<${String(f.id).replace(/[^a-zA-Z0-9]/g, "")}@closeloop.local>` : null,
      };
      return { ...defaults, ...f };
    });
    state.data.quotes = (state.data.quotes ?? []).map((q) => ({ ...({ emailThreadId: null } as Record<string, unknown>), ...q }));
  }
  if (version < 3 && state.data) {
    const quotes = (state.data.quotes ?? []) as Array<Record<string, unknown>>;
    state.data.quotes = quotes.map((q) => (q.replyToken ? q : { ...q, replyToken: createSecureToken() })) as never;
    const followUps = (state.data.followUps ?? []) as Array<Record<string, unknown>>;
    state.data.followUps = followUps.map((f) => ({ ...({ recipientEmail: null } as Record<string, unknown>), ...f })) as never;
  }
  return persisted;
}

/** True once the persisted state has been read from storage (client only). */
export function useHydrated(): boolean {
  return useAppStore((s) => s.hydrated);
}
