import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkspaceData } from "../types";
import type { DomainContext } from "../domain/context";
import { diffWorkspace, isEmptyChangeSet, type WorkspaceChangeSet, type WorkspaceRepository } from "../persistence/repository";
import { rowsToWorkspace } from "./mappers";

/**
 * Postgres-backed workspace repository.
 *
 * Reads: one RPC (`load_workspace`). Writes: one RPC (`apply_workspace_changes`)
 * that applies the change set in a single transaction, locks the affected
 * quotes and enforces the business boundary server-side. Claims: the atomic
 * `claim_follow_up` function (service role only).
 *
 * With a user client, RLS applies to all three. With the service client, the
 * function bodies still force every row onto `businessId`.
 */
export class SupabaseWorkspaceRepository implements WorkspaceRepository {
  readonly name = "supabase";

  constructor(
    private readonly client: SupabaseClient,
    readonly businessId: string,
  ) {}

  async load(): Promise<WorkspaceData> {
    const { data, error } = await this.client.rpc("load_workspace", { p_business_id: this.businessId });
    if (error) throw new Error(`load_workspace failed: ${error.message}`);
    return rowsToWorkspace(data as Record<string, unknown> | null);
  }

  async save(next: WorkspaceData, previous: WorkspaceData): Promise<WorkspaceChangeSet> {
    const changes = diffWorkspace(previous, next);
    await this.apply(changes);
    return changes;
  }

  async apply(changes: WorkspaceChangeSet): Promise<void> {
    if (isEmptyChangeSet(changes)) return;
    const { error } = await this.client.rpc("apply_workspace_changes", { p_business_id: this.businessId, p_changes: changes });
    if (error) throw new Error(`apply_workspace_changes failed: ${error.message}`);
  }

  async tryClaimFollowUp(followUpId: string, _ctx: DomainContext): Promise<boolean> {
    void _ctx;
    const { data, error } = await this.client.rpc("claim_follow_up", { p_follow_up_id: followUpId });
    if (error) throw new Error(`claim_follow_up failed: ${error.message}`);
    return data === true;
  }
}
