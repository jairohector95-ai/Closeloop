import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createUserClient } from "./supabase";

export interface SessionInfo {
  client: SupabaseClient;
  user: User;
}

/** Returns the signed-in user and an RLS-scoped client, or null. Verified with the auth server, not just the cookie. */
export async function getSession(): Promise<SessionInfo | null> {
  const client = await createUserClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return { client, user: data.user };
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Not signed in");
  }
}

export async function requireSession(): Promise<SessionInfo> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();
  return session;
}

export function isAdminEmail(email: string | undefined | null): boolean {
  const list = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return !!email && list.includes(email.toLowerCase());
}
