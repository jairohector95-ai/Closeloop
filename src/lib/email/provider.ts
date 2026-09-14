import type { EmailMessage } from "../types";

export interface SendResult {
  ok: boolean;
  providerMessageId: string | null;
  error?: string;
}

/**
 * Abstraction over the outbound email service.
 *
 * Phase 1 ships only the simulated provider, which never touches the network.
 * Phase 2 adds e.g. `ResendEmailProvider` / `PostmarkEmailProvider` behind
 * the same interface, selected by environment variable.
 */
export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<SendResult>;
}

export class SimulatedEmailProvider implements EmailProvider {
  readonly name = "simulated";
  readonly outbox: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<SendResult> {
    this.outbox.push(message);
    return { ok: true, providerMessageId: `sim_${this.outbox.length}` };
  }
}

export function getEmailProvider(): EmailProvider {
  // Phase 2: switch on process.env.EMAIL_PROVIDER here.
  return new SimulatedEmailProvider();
}
