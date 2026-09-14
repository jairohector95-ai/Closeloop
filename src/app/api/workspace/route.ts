import { requireSession } from "@/lib/server/auth";
import { loadAccount } from "@/lib/server/account";
import { validateChangeSet } from "@/lib/server/changeset";
import { errorResponse, json } from "@/lib/server/http";
import { SupabaseWorkspaceRepository } from "@/lib/server/repository";

/** GET: everything the app needs after sign-in. POST: apply a change set produced by the browser. */
export async function GET() {
  try {
    const { client, user } = await requireSession();
    const account = await loadAccount(client, user);
    if (!account) return json({ account: null, data: null, lastSweep: null });
    const repository = new SupabaseWorkspaceRepository(client, account.business.id);
    const [data, sweep] = await Promise.all([
      repository.load(),
      client.from("sweep_runs").select("ran_at, sent, failed, errors").eq("business_id", account.business.id).order("ran_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    return json({ account, data, lastSweep: sweep.data ?? null });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { client, user } = await requireSession();
    const account = await loadAccount(client, user);
    if (!account) return json({ error: "Complete onboarding first" }, 409);
    const body = await request.json().catch(() => null);
    const validated = validateChangeSet(body, account.business.id);
    if (!validated.ok) return json({ error: validated.error }, 400);
    const repository = new SupabaseWorkspaceRepository(client, account.business.id);
    await repository.apply(validated.changes);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
