/**
 * Server-side configuration. Everything is optional: with nothing set, the
 * app runs fully simulated (Phase 1). Never import this from client components.
 */

export type EmailProviderId = "simulated" | "resend" | "postmark";

export interface ServerConfig {
  emailProvider: EmailProviderId;
  resendApiKey: string | null;
  postmarkServerToken: string | null;
  /** Verified sender used for Phase A ("sent via CloseLoop") delivery, e.g. "follow-ups@mail.closeloop.app". */
  fromAddress: string | null;
  /** Domain that receives replies, e.g. "reply.closeloop.app" (or "<id>.resend.app" in development). */
  replyDomain: string | null;
  /** Svix signing secret for Resend webhooks ("whsec_..."). */
  resendWebhookSecret: string | null;
  /** Shared secret that cron callers must present. */
  jobsSecret: string | null;
  /** Public URL of the app, used for auth redirects, e.g. "https://app.closeloop.app". */
  appUrl: string | null;
  /** Allow the simulated provider to mark follow-ups as sent in cloud mode (development only). */
  allowSimulatedEmail: boolean;
  google: { clientId: string | null; clientSecret: string | null; redirectUri: string | null };
  microsoft: { clientId: string | null; clientSecret: string | null; redirectUri: string | null; tenant: string };
}

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const read = (name: string): string | null => {
    const value = env[name];
    return value && value.trim() ? value.trim() : null;
  };
  const requested = (env.EMAIL_PROVIDER ?? "simulated").toLowerCase();
  const resendApiKey = read("RESEND_API_KEY");
  const postmarkServerToken = read("POSTMARK_SERVER_TOKEN");

  let emailProvider: EmailProviderId = "simulated";
  if (requested === "resend" && resendApiKey) emailProvider = "resend";
  if (requested === "postmark" && postmarkServerToken) emailProvider = "postmark";

  return {
    emailProvider,
    resendApiKey,
    postmarkServerToken,
    fromAddress: read("EMAIL_FROM_ADDRESS"),
    replyDomain: read("EMAIL_REPLY_DOMAIN"),
    resendWebhookSecret: read("RESEND_WEBHOOK_SECRET"),
    jobsSecret: read("JOBS_SECRET") ?? read("CRON_SECRET"),
    appUrl: read("NEXT_PUBLIC_APP_URL"),
    allowSimulatedEmail: (env.ALLOW_SIMULATED_EMAIL ?? "").toLowerCase() === "true",
    google: { clientId: read("GOOGLE_CLIENT_ID"), clientSecret: read("GOOGLE_CLIENT_SECRET"), redirectUri: read("GOOGLE_REDIRECT_URI") },
    microsoft: {
      clientId: read("MICROSOFT_CLIENT_ID"),
      clientSecret: read("MICROSOFT_CLIENT_SECRET"),
      redirectUri: read("MICROSOFT_REDIRECT_URI"),
      tenant: read("MICROSOFT_TENANT") ?? "common",
    },
  };
}

import { LOCAL_EMAIL_ROUTING, type EmailRouting } from "../domain/context";

/** Outbound addressing derived from config; falls back to local placeholders. */
export function emailRoutingFrom(config: ServerConfig): EmailRouting {
  return {
    fromAddress: config.fromAddress ?? LOCAL_EMAIL_ROUTING.fromAddress,
    replyDomain: config.replyDomain ?? LOCAL_EMAIL_ROUTING.replyDomain,
    brandSuffix: LOCAL_EMAIL_ROUTING.brandSuffix,
  };
}
