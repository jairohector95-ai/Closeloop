/**
 * CloseLoop runs in one of two modes, decided at build time by public env vars:
 *
 *  - local: no Supabase configured. Everything lives in the browser (Phase 1
 *    demo experience). No sign-in, simulated email and calendar.
 *  - cloud: Supabase configured. Real accounts, Postgres, scheduler, email.
 *
 * Safe to import from client components (only NEXT_PUBLIC_ vars are read).
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isCloudMode: boolean = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export function signInHref(): string {
  return isCloudMode ? "/login" : "/dashboard";
}

export function startHref(): string {
  return isCloudMode ? "/signup" : "/onboarding";
}
