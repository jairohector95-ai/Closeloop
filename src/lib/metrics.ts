import type { Account, Business, Quote, Subscription, User, WorkspaceData } from "./types";
import { planById } from "./constants";
import { isActive } from "./domain/status";

export interface DashboardMetrics {
  awaitingResponse: number;
  followUpsScheduled: number;
  customersReplied: number;
  jobsWon: number;
  totalQuoteValue: number;
  recoveredRevenue: number;
  followUpsSent: number;
  openPipelineValue: number;
}

/** "Recovered" = won after at least one automated follow-up went out. */
export function isRecovered(quote: Quote): boolean {
  return quote.status === "won" && quote.followUpsSent > 0;
}

export function computeDashboardMetrics(data: WorkspaceData): DashboardMetrics {
  const quotes = data.quotes;
  const active = quotes.filter((q) => isActive(q.status));
  return {
    awaitingResponse: active.length,
    followUpsScheduled: data.followUps.filter(
      (f) => f.status === "scheduled" && active.some((q) => q.id === f.quoteId),
    ).length,
    customersReplied: quotes.filter((q) => q.repliedAt !== null).length,
    jobsWon: quotes.filter((q) => q.status === "won").length,
    totalQuoteValue: quotes.filter((q) => q.status !== "lost").reduce((sum, q) => sum + q.amount, 0),
    recoveredRevenue: quotes.filter(isRecovered).reduce((sum, q) => sum + q.amount, 0),
    followUpsSent: quotes.reduce((sum, q) => sum + q.followUpsSent, 0),
    openPipelineValue: quotes
      .filter((q) => isActive(q.status) || q.status === "paused")
      .reduce((sum, q) => sum + q.amount, 0),
  };
}

export interface PlatformAccount {
  user: User;
  business: Business;
  subscription: Subscription;
}

export interface AdminMetrics {
  totalUsers: number;
  activeQuotes: number;
  quotesWon: number;
  mrr: number;
  trialUsers: number;
  paidUsers: number;
  conversionRate: number;
  followUpsSent: number;
  jobsRecovered: number;
  recoveredRevenue: number;
}

export function computeAdminMetrics(account: Account | null, demoAccounts: PlatformAccount[], data: WorkspaceData): AdminMetrics {
  const accounts: PlatformAccount[] = [...(account ? [account] : []), ...demoAccounts];
  const paid = accounts.filter((a) => a.subscription.status === "active" && a.subscription.plan !== "trial");
  const trials = accounts.filter((a) => a.subscription.status === "trialing");
  const mrr = paid.reduce((sum, a) => sum + planById(a.subscription.plan).priceMonthly, 0);
  const totalUsers = accounts.length;

  return {
    totalUsers,
    activeQuotes: data.quotes.filter((q) => isActive(q.status)).length,
    quotesWon: data.quotes.filter((q) => q.status === "won").length,
    mrr,
    trialUsers: trials.length,
    paidUsers: paid.length,
    conversionRate: totalUsers === 0 ? 0 : paid.length / totalUsers,
    followUpsSent: data.quotes.reduce((sum, q) => sum + q.followUpsSent, 0),
    jobsRecovered: data.quotes.filter(isRecovered).length,
    recoveredRevenue: data.quotes.filter(isRecovered).reduce((sum, q) => sum + q.amount, 0),
  };
}
