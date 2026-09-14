import type { Customer, FollowUp, InboundEmail, Quote, TimelineEvent, WorkspaceData } from "../types";
import type { DomainContext } from "../domain/context";
import { claimFollowUp } from "../domain/automation";

/**
 * Storage boundary for one business's workspace.
 *
 * The domain layer works on immutable `WorkspaceData` snapshots. A repository
 * turns "before" and "after" snapshots into row-level writes via
 * `diffWorkspace`, so a Postgres implementation only upserts/deletes what
 * changed. The in-memory implementation is used by tests and mirrors what the
 * browser store does with localStorage.
 */

export interface WorkspaceChangeSet {
  upserts: {
    customers: Customer[];
    quotes: Quote[];
    followUps: FollowUp[];
    timeline: TimelineEvent[];
    inbound: InboundEmail[];
  };
  deletes: {
    customers: string[];
    quotes: string[];
    followUps: string[];
    timeline: string[];
    inbound: string[];
  };
}

function diffTable<T extends { id: string }>(before: T[], after: T[]): { upserts: T[]; deletes: string[] } {
  const beforeById = new Map(before.map((row) => [row.id, row]));
  const afterIds = new Set(after.map((row) => row.id));
  const upserts = after.filter((row) => {
    const prev = beforeById.get(row.id);
    return !prev || prev !== row;
  });
  const deletes = before.filter((row) => !afterIds.has(row.id)).map((row) => row.id);
  return { upserts, deletes };
}

/** Computes row-level changes between two snapshots. Relies on the domain's structural sharing (unchanged rows keep identity). */
export function diffWorkspace(before: WorkspaceData, after: WorkspaceData): WorkspaceChangeSet {
  const customers = diffTable(before.customers, after.customers);
  const quotes = diffTable(before.quotes, after.quotes);
  const followUps = diffTable(before.followUps, after.followUps);
  const timeline = diffTable(before.timeline, after.timeline);
  const inbound = diffTable(before.inbound, after.inbound);
  return {
    upserts: { customers: customers.upserts, quotes: quotes.upserts, followUps: followUps.upserts, timeline: timeline.upserts, inbound: inbound.upserts },
    deletes: { customers: customers.deletes, quotes: quotes.deletes, followUps: followUps.deletes, timeline: timeline.deletes, inbound: inbound.deletes },
  };
}

export function isEmptyChangeSet(set: WorkspaceChangeSet): boolean {
  return Object.values(set.upserts).every((rows) => rows.length === 0) && Object.values(set.deletes).every((ids) => ids.length === 0);
}

export interface WorkspaceRepository {
  readonly name: string;
  load(): Promise<WorkspaceData>;
  /** Persists the difference between `previous` and `next`. */
  save(next: WorkspaceData, previous: WorkspaceData): Promise<WorkspaceChangeSet>;
  /**
   * Atomically moves a follow-up from scheduled → sending. Returns false if it
   * was already claimed, sent or cancelled. This is the single most important
   * method for "never send twice".
   */
  tryClaimFollowUp(followUpId: string, ctx: DomainContext): Promise<boolean>;
}

export class InMemoryWorkspaceRepository implements WorkspaceRepository {
  readonly name = "memory";
  readonly history: WorkspaceChangeSet[] = [];
  private claiming = false;

  constructor(private data: WorkspaceData) {}

  async load(): Promise<WorkspaceData> {
    return this.data;
  }

  async save(next: WorkspaceData, previous: WorkspaceData): Promise<WorkspaceChangeSet> {
    const changes = diffWorkspace(previous, next);
    // Merge on top of current state so concurrent writers don't clobber each other.
    this.data = applyChangeSet(this.data, changes);
    this.history.push(changes);
    return changes;
  }

  async tryClaimFollowUp(followUpId: string, ctx: DomainContext): Promise<boolean> {
    // JS is single-threaded, but guard anyway so the contract mirrors the DB version.
    if (this.claiming) return false;
    this.claiming = true;
    try {
      const claimed = claimFollowUp(this.data, followUpId, ctx);
      if (!claimed) return false;
      this.data = claimed;
      return true;
    } finally {
      this.claiming = false;
    }
  }
}

function applyTable<T extends { id: string }>(current: T[], upserts: T[], deletes: string[]): T[] {
  const deleted = new Set(deletes);
  const byId = new Map(current.filter((row) => !deleted.has(row.id)).map((row) => [row.id, row]));
  for (const row of upserts) byId.set(row.id, row);
  return Array.from(byId.values());
}

export function applyChangeSet(current: WorkspaceData, changes: WorkspaceChangeSet): WorkspaceData {
  return {
    customers: applyTable(current.customers, changes.upserts.customers, changes.deletes.customers),
    quotes: applyTable(current.quotes, changes.upserts.quotes, changes.deletes.quotes),
    followUps: applyTable(current.followUps, changes.upserts.followUps, changes.deletes.followUps),
    timeline: applyTable(current.timeline, changes.upserts.timeline, changes.deletes.timeline),
    inbound: applyTable(current.inbound, changes.upserts.inbound, changes.deletes.inbound),
  };
}
