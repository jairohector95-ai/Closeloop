import type { SupabaseClient } from "@supabase/supabase-js";
import { createContext } from "../domain/context";
import { createEmailProvider, type EmailProvider } from "../email/provider";
import { runFollowUpSweep, type SweepReport } from "../jobs/sweep";
import { todayISO } from "../utils/date";
import { emailRoutingFrom, type ServerConfig } from "../config/env";
import { rowToBusiness, rowToSettings } from "./mappers";
import { SupabaseWorkspaceRepository } from "./repository";

/**
 * Production entrypoints for the follow-up scheduler. Both use the service
 * client (no user session) and record every run in `sweep_runs`.
 */

export type SweepTrigger = "cron" | "manual";

export const PROVIDER_NOT_CONFIGURED = "Email sending is not configured yet (set EMAIL_PROVIDER and RESEND_API_KEY).";

function emptyReport(): SweepReport {
  return { attempted: 0, sent: 0, failed: 0, skipped: 0, errors: [], sentFollowUpIds: [] };
}

export function providerFor(config: ServerConfig): EmailProvider | null {
  const provider = createEmailProvider(config);
  if (provider.name === "simulated" && !config.allowSimulatedEmail) return null;
  return provider;
}

async function recordRun(service: SupabaseClient, businessId: string | null, trigger: SweepTrigger, report: SweepReport): Promise<void> {
  const { error } = await service.from("sweep_runs").insert({
    business_id: businessId,
    trigger,
    attempted: report.attempted,
    sent: report.sent,
    failed: report.failed,
    skipped: report.skipped,
    errors: report.errors.slice(0, 20),
  });
  if (error) console.error("[sweep] could not record run", error.message);
}

export async function runSweepForBusiness(service: SupabaseClient, businessId: string, trigger: SweepTrigger, config: ServerConfig): Promise<SweepReport> {
  const provider = providerFor(config);
  if (!provider) {
    const report = { ...emptyReport(), errors: [PROVIDER_NOT_CONFIGURED] };
    await recordRun(service, businessId, trigger, report);
    return report;
  }

  const [business, settings] = await Promise.all([
    service.from("businesses").select("*").eq("id", businessId).single(),
    service.from("settings").select("*").eq("business_id", businessId).single(),
  ]);
  if (business.error || settings.error) {
    throw new Error(`sweep: business ${businessId} not loadable: ${business.error?.message ?? settings.error?.message}`);
  }

  const ctx = createContext(rowToBusiness(business.data), rowToSettings(settings.data), todayISO(), emailRoutingFrom(config));
  const repository = new SupabaseWorkspaceRepository(service, businessId);
  const report = await runFollowUpSweep({
    repository,
    provider,
    contextFor: () => ctx,
    skipDemoQuotes: provider.name !== "simulated",
  });
  await recordRun(service, businessId, trigger, report);
  return report;
}

export async function runSweepForAllDue(service: SupabaseClient, config: ServerConfig): Promise<SweepReport & { businesses: number }> {
  const { data, error } = await service.rpc("businesses_with_due_follow_ups");
  if (error) throw new Error(`businesses_with_due_follow_ups failed: ${error.message}`);
  const ids: string[] = Array.isArray(data) ? data.map((row: unknown) => (typeof row === "string" ? row : String((row as Record<string, unknown>).businesses_with_due_follow_ups ?? ""))).filter(Boolean) : [];

  const total = { ...emptyReport(), businesses: ids.length };
  for (const businessId of ids) {
    try {
      const report = await runSweepForBusiness(service, businessId, "cron", config);
      total.attempted += report.attempted;
      total.sent += report.sent;
      total.failed += report.failed;
      total.skipped += report.skipped;
      total.errors.push(...report.errors.map((e) => `${businessId}: ${e}`));
      total.sentFollowUpIds.push(...report.sentFollowUpIds);
    } catch (error) {
      total.errors.push(`${businessId}: ${String(error)}`);
    }
  }
  await recordRun(service, null, "cron", total);
  // Housekeeping: old webhook ids are no longer needed for replay protection.
  await service.rpc("prune_webhook_events");
  return total;
}
