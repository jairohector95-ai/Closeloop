import { loadServerConfig } from "@/lib/config/env";
import { json } from "@/lib/server/http";
import { createServiceClient } from "@/lib/server/supabase";
import { handleResendReceived } from "@/lib/server/inbound-handler";
import { ResendApi, verifySvixSignature, type ResendReceivedEvent } from "@/lib/integrations/resend";

/**
 * Resend webhook receiver.
 *
 *  - Verifies the Svix signature on the raw body (rejects unsigned, tampered
 *    or >5-minute-old deliveries).
 *  - Records the delivery id; a duplicate or replayed delivery is acknowledged
 *    with 200 and does nothing.
 *  - Handles `email.received`; every other event type is acknowledged.
 *  - Returns 500 only for transient failures so Resend retries.
 */
export async function POST(request: Request) {
  const config = loadServerConfig();
  if (!config.resendWebhookSecret || !config.resendApiKey) return json({ error: "webhook not configured" }, 503);

  const rawBody = await request.text();
  const verified = await verifySvixSignature(
    config.resendWebhookSecret,
    { id: request.headers.get("svix-id"), timestamp: request.headers.get("svix-timestamp"), signature: request.headers.get("svix-signature") },
    rawBody,
  );
  if (!verified.ok) return json({ error: "invalid signature" }, 401);

  let event: ResendReceivedEvent;
  try {
    event = JSON.parse(rawBody) as ResendReceivedEvent;
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  if (!event || typeof event.type !== "string") return json({ error: "invalid event" }, 400);

  const service = createServiceClient();
  const deliveryId = request.headers.get("svix-id") as string;
  const fresh = await service.rpc("record_webhook_event", { p_id: deliveryId, p_provider: "resend", p_event_type: event.type });
  if (fresh.error) {
    console.error("[webhook] record_webhook_event", fresh.error.message);
    return json({ error: "temporary failure" }, 500);
  }
  if (fresh.data !== true) return json({ ok: true, duplicate: true });

  if (event.type !== "email.received") return json({ ok: true, ignored: event.type });
  if (!event.data || typeof event.data.email_id !== "string") return json({ error: "invalid event data" }, 400);

  try {
    const outcome = await handleResendReceived(service, config, event, new ResendApi(config.resendApiKey));
    // Log outcome only (never the email content).
    console.info("[webhook] email.received", { id: event.data.email_id, status: outcome.status, reason: outcome.reason ?? null });
    return json({ ok: true, status: outcome.status });
  } catch (error) {
    console.error("[webhook] processing failed", error instanceof Error ? error.message : error);
    return json({ error: "temporary failure" }, 500);
  }
}
