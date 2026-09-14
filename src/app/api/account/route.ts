import { requireSession } from "@/lib/server/auth";
import { createBusiness, loadAccount, updateBusinessProfile, updateSettingsRow } from "@/lib/server/account";
import { errorResponse, json } from "@/lib/server/http";
import { SupabaseWorkspaceRepository } from "@/lib/server/repository";
import { diffWorkspace } from "@/lib/persistence/repository";
import { buildDemoWorkspace } from "@/lib/demo/seed";
import { validateOnboarding } from "@/lib/validation";
import { BUSINESS_TYPES, TONES } from "@/lib/constants";
import { normalizeSchedule } from "@/lib/domain/quotes";
import { todayISO } from "@/lib/utils/date";
import type { BusinessType, Tone } from "@/lib/types";

const EMPTY = { customers: [], quotes: [], followUps: [], timeline: [], inbound: [] };

/** POST: first-time onboarding. Creates the business (one per user) and optional demo data. */
export async function POST(request: Request) {
  try {
    const { client, user } = await requireSession();
    const existing = await loadAccount(client, user);
    if (existing) return json({ error: "You already have a business" }, 409);

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const values = {
      businessName: String(body.businessName ?? ""),
      ownerName: String(body.ownerName ?? ""),
      email: String(body.email ?? user.email ?? ""),
    };
    const errors = validateOnboarding(values);
    if (Object.keys(errors).length) return json({ error: Object.values(errors)[0], fields: errors }, 400);
    const type = BUSINESS_TYPES.some((t) => t.id === body.type) ? (body.type as BusinessType) : "other";
    const tone = TONES.some((t) => t.id === body.tone) ? (body.tone as Tone) : "friendly";

    await createBusiness(client, { ...values, type, tone });
    const account = await loadAccount(client, user);
    if (!account) throw new Error("account missing after create_business");

    const repository = new SupabaseWorkspaceRepository(client, account.business.id);
    if (body.loadDemoData === true) {
      const demo = buildDemoWorkspace(account, todayISO());
      await repository.apply(diffWorkspace(EMPTY, demo));
    }
    return json({ account, data: await repository.load() }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

/** PATCH: update business profile and/or settings. */
export async function PATCH(request: Request) {
  try {
    const { client, user } = await requireSession();
    const account = await loadAccount(client, user);
    if (!account) return json({ error: "Complete onboarding first" }, 409);
    const body = (await request.json().catch(() => ({}))) as { business?: Record<string, unknown>; settings?: Record<string, unknown> };

    if (body.business) {
      const b = body.business;
      const patch: Parameters<typeof updateBusinessProfile>[2] = {};
      if (typeof b.name === "string" && b.name.trim()) patch.name = b.name.trim().slice(0, 200);
      if (typeof b.ownerName === "string" && b.ownerName.trim()) patch.ownerName = b.ownerName.trim().slice(0, 200);
      if (typeof b.email === "string" && b.email.includes("@")) patch.email = b.email.trim().toLowerCase();
      if (BUSINESS_TYPES.some((t) => t.id === b.type)) patch.type = b.type as BusinessType;
      await updateBusinessProfile(client, account.business.id, patch);
    }
    if (body.settings) {
      const s = body.settings;
      const patch: Parameters<typeof updateSettingsRow>[2] = {};
      if (Array.isArray(s.defaultSchedule)) patch.defaultSchedule = normalizeSchedule(s.defaultSchedule.map(Number));
      if (TONES.some((t) => t.id === s.defaultTone)) patch.defaultTone = s.defaultTone as Tone;
      if (typeof s.signature === "string") patch.signature = s.signature.slice(0, 300);
      await updateSettingsRow(client, account.business.id, patch);
    }
    return json({ account: await loadAccount(client, user) });
  } catch (error) {
    return errorResponse(error);
  }
}
