import type { Business, ISODate, ISODateTime, Settings } from "../types";
import { instantOn, todayISO } from "../utils/date";

/** How outbound email is addressed. Configured from the environment in production. */
export interface EmailRouting {
  /** Verified sender, e.g. "followup@mail.closeloop.app". */
  fromAddress: string;
  /** Domain that receives replies, e.g. "reply.closeloop.app". */
  replyDomain: string;
  /** Appended to the business name in the From header. */
  brandSuffix: string;
}

export const LOCAL_EMAIL_ROUTING: EmailRouting = {
  fromAddress: "followup@closeloop.local",
  replyDomain: "reply.closeloop.local",
  brandSuffix: "via CloseLoop",
};

/** Everything a domain operation needs to know about "when" and "who". */
export interface DomainContext {
  business: Business;
  settings: Settings;
  /** The calendar date the operation is happening on (real or simulated). */
  today: ISODate;
  /** Instant used for timestamps. */
  now: ISODateTime;
  email: EmailRouting;
}

export function createContext(business: Business, settings: Settings, today?: ISODate, email: EmailRouting = LOCAL_EMAIL_ROUTING): DomainContext {
  const day = today ?? todayISO();
  return { business, settings, today: day, now: instantOn(day), email };
}
