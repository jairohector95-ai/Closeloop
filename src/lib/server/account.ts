import type { SupabaseClient, User as SupabaseUser } from "@supabase/supabase-js";
import type { Account, BusinessType, Tone, User } from "../types";
import { buildAccount } from "./mappers";

/** Loads the signed-in user's account (business, settings, subscription) or null before onboarding. */
export async function loadAccount(client: SupabaseClient, authUser: SupabaseUser): Promise<Account | null> {
  const { data: businessId, error: idError } = await client.rpc("current_business_id");
  if (idError) throw new Error(`current_business_id failed: ${idError.message}`);
  if (!businessId) return null;

  const [business, settings, subscription] = await Promise.all([
    client.from("businesses").select("*").eq("id", businessId).single(),
    client.from("settings").select("*").eq("business_id", businessId).single(),
    client.from("subscriptions").select("*").eq("business_id", businessId).single(),
  ]);
  if (business.error || settings.error || subscription.error) {
    throw new Error(`account load failed: ${business.error?.message ?? settings.error?.message ?? subscription.error?.message}`);
  }
  const user: User = {
    id: authUser.id,
    name: String(business.data.owner_name ?? ""),
    email: authUser.email ?? String(business.data.email ?? ""),
    createdAt: authUser.created_at ?? new Date().toISOString(),
  };
  return buildAccount(user, business.data, settings.data, subscription.data);
}

export interface CreateBusinessInput {
  businessName: string;
  ownerName: string;
  email: string;
  type: BusinessType;
  tone: Tone;
}

export async function createBusiness(client: SupabaseClient, input: CreateBusinessInput): Promise<string> {
  const { data, error } = await client.rpc("create_business", {
    p_name: input.businessName,
    p_owner_name: input.ownerName,
    p_email: input.email,
    p_type: input.type,
    p_tone: input.tone,
  });
  if (error) throw new Error(`create_business failed: ${error.message}`);
  return String(data);
}

export async function updateBusinessProfile(
  client: SupabaseClient,
  businessId: string,
  patch: Partial<{ name: string; ownerName: string; email: string; type: BusinessType }>,
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.ownerName !== undefined) row.owner_name = patch.ownerName;
  if (patch.email !== undefined) row.email = patch.email;
  if (patch.type !== undefined) row.type = patch.type;
  if (Object.keys(row).length === 0) return;
  const { error } = await client.from("businesses").update(row).eq("id", businessId);
  if (error) throw new Error(`business update failed: ${error.message}`);
}

export async function updateSettingsRow(
  client: SupabaseClient,
  businessId: string,
  patch: Partial<{ defaultSchedule: number[]; defaultTone: Tone; signature: string }>,
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.defaultSchedule !== undefined) row.default_schedule = patch.defaultSchedule;
  if (patch.defaultTone !== undefined) row.default_tone = patch.defaultTone;
  if (patch.signature !== undefined) row.signature = patch.signature;
  if (Object.keys(row).length === 0) return;
  const { error } = await client.from("settings").update(row).eq("business_id", businessId);
  if (error) throw new Error(`settings update failed: ${error.message}`);
}
