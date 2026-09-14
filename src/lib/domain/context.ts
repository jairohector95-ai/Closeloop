import type { Business, ISODate, ISODateTime, Settings } from "../types";
import { instantOn, todayISO } from "../utils/date";

/** Everything a domain operation needs to know about "when" and "who". */
export interface DomainContext {
  business: Business;
  settings: Settings;
  /** The calendar date the operation is happening on (real or simulated). */
  today: ISODate;
  /** Instant used for timestamps. */
  now: ISODateTime;
}

export function createContext(business: Business, settings: Settings, today?: ISODate): DomainContext {
  const day = today ?? todayISO();
  return { business, settings, today: day, now: instantOn(day) };
}
