import type { Account, WorkspaceData } from "../types";
import type { WorkspaceChangeSet } from "../persistence/repository";

/**
 * Browser → server calls used in cloud mode. Every write is a change set
 * (see persistence/repository.ts) applied in one transaction server-side.
 */

export interface RemoteWorkspace {
  account: Account | null;
  data: WorkspaceData | null;
  lastSweep: { ran_at: string; sent: number; failed: number; errors: string[] } | null;
}

export class RemoteError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(input: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(input, { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) }, credentials: "same-origin" });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new RemoteError(res.status, (body as { error?: string }).error ?? `Request failed (${res.status})`);
  return body as T;
}

export const remote = {
  fetchWorkspace: () => call<RemoteWorkspace>("/api/workspace"),
  pushChanges: (changes: WorkspaceChangeSet) => call<void>("/api/workspace", { method: "POST", body: JSON.stringify(changes) }),
  createAccount: (input: unknown) => call<{ account: Account; data: WorkspaceData }>("/api/account", { method: "POST", body: JSON.stringify(input) }),
  patchAccount: (input: unknown) => call<{ account: Account }>("/api/account", { method: "PATCH", body: JSON.stringify(input) }),
  runSweep: () => call<{ ok: boolean; sent: number; failed: number; attempted: number; errors: string[]; sentFollowUpIds: string[]; ranAt: string }>("/api/jobs/run", { method: "POST" }),
};

/**
 * Serialises change sets so they reach the server in order, and retries a
 * failed push a few times before giving up and surfacing the error.
 */
export class SyncQueue {
  private chain: Promise<void> = Promise.resolve();
  private failures = 0;

  constructor(
    private readonly push: (changes: WorkspaceChangeSet) => Promise<void>,
    private readonly onStatus: (status: "idle" | "saving" | "error", error?: string) => void,
  ) {}

  enqueue(changes: WorkspaceChangeSet): void {
    this.chain = this.chain.then(async () => {
      this.onStatus("saving");
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          await this.push(changes);
          this.failures = 0;
          this.onStatus("idle");
          return;
        } catch (error) {
          const remoteError = error instanceof RemoteError ? error : null;
          // Client errors (bad payload / signed out) will not succeed on retry.
          if (remoteError && remoteError.status < 500 && remoteError.status !== 429) {
            this.onStatus("error", remoteError.message);
            return;
          }
          await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        }
      }
      this.failures += 1;
      this.onStatus("error", "Couldn't save your last change. Check your connection and try again.");
    });
  }
}
