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
  /** Address inbound replies are routed to (Postmark/Resend inbound), e.g. "reply@in.closeloop.app". */
  inboundAddress: string | null;
  /** Shared secret that cron / webhook callers must present. */
  jobsSecret: string | null;
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
    inboundAddress: read("EMAIL_INBOUND_ADDRESS"),
    jobsSecret: read("JOBS_SECRET"),
    google: { clientId: read("GOOGLE_CLIENT_ID"), clientSecret: read("GOOGLE_CLIENT_SECRET"), redirectUri: read("GOOGLE_REDIRECT_URI") },
    microsoft: {
      clientId: read("MICROSOFT_CLIENT_ID"),
      clientSecret: read("MICROSOFT_CLIENT_SECRET"),
      redirectUri: read("MICROSOFT_REDIRECT_URI"),
      tenant: read("MICROSOFT_TENANT") ?? "common",
    },
  };
}
