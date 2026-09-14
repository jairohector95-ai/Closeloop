import type { WorkspaceChangeSet } from "../persistence/repository";

/**
 * Validates a change set posted by the browser before it reaches the database.
 * The database enforces the same rules again (and RLS on top); this layer just
 * fails fast with a clear error and bounds payload size.
 */

const TABLES = ["customers", "quotes", "followUps", "timeline", "inbound"] as const;
type Table = (typeof TABLES)[number];
const MAX_ROWS = 2000;

export type ChangeSetError = { ok: false; error: string };
export type ChangeSetOk = { ok: true; changes: WorkspaceChangeSet };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function validateChangeSet(input: unknown, businessId: string): ChangeSetOk | ChangeSetError {
  if (!isRecord(input)) return { ok: false, error: "change set must be an object" };
  const upserts = isRecord(input.upserts) ? input.upserts : {};
  const deletes = isRecord(input.deletes) ? input.deletes : {};

  const out: WorkspaceChangeSet = {
    upserts: { customers: [], quotes: [], followUps: [], timeline: [], inbound: [] },
    deletes: { customers: [], quotes: [], followUps: [], timeline: [], inbound: [] },
  };
  let rows = 0;

  for (const table of TABLES) {
    const up = upserts[table];
    if (up !== undefined) {
      if (!Array.isArray(up)) return { ok: false, error: `upserts.${table} must be an array` };
      for (const row of up) {
        if (!isRecord(row) || typeof row.id !== "string") return { ok: false, error: `upserts.${table} rows need a string id` };
        const rowBusiness = row.businessId;
        if (typeof rowBusiness === "string" && rowBusiness !== businessId) {
          return { ok: false, error: `upserts.${table} row ${row.id} belongs to another business` };
        }
        rows += 1;
      }
      (out.upserts[table as Table] as unknown[]).push(...up);
    }
    const del = deletes[table];
    if (del !== undefined) {
      if (!Array.isArray(del) || del.some((id) => typeof id !== "string")) return { ok: false, error: `deletes.${table} must be string ids` };
      rows += del.length;
      out.deletes[table as Table].push(...(del as string[]));
    }
  }
  if (rows > MAX_ROWS) return { ok: false, error: `change set too large (${rows} rows)` };
  return { ok: true, changes: out };
}
