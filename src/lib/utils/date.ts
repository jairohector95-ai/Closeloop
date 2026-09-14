import type { ISODate, ISODateTime } from "../types";

const MS_PER_DAY = 86_400_000;

/** Returns today's calendar date in the user's local timezone as YYYY-MM-DD. */
export function todayISO(now: Date = new Date()): ISODate {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parses a YYYY-MM-DD string into a Date at local midnight. */
export function parseISODate(date: ISODate): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = parseISODate(date);
  d.setDate(d.getDate() + days);
  return todayISO(d);
}

/** Whole days from `a` to `b` (positive when b is later). */
export function diffDays(a: ISODate, b: ISODate): number {
  const start = parseISODate(a).getTime();
  const end = parseISODate(b).getTime();
  return Math.round((end - start) / MS_PER_DAY);
}

export function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = parseISODate(value);
  return !Number.isNaN(d.getTime()) && todayISO(d) === value;
}

/** Combines a calendar date with the current wall-clock time into an ISO instant. */
export function instantOn(date: ISODate, now: Date = new Date()): ISODateTime {
  const d = parseISODate(date);
  d.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  return d.toISOString();
}

export function dateOfInstant(instant: ISODateTime): ISODate {
  return todayISO(new Date(instant));
}

const shortFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const longFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const weekdayFmt = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

export function formatShort(date: ISODate | ISODateTime): string {
  return shortFmt.format(toDate(date));
}

export function formatLong(date: ISODate | ISODateTime): string {
  return longFmt.format(toDate(date));
}

export function formatWeekday(date: ISODate | ISODateTime): string {
  return weekdayFmt.format(toDate(date));
}

/** "Today", "Tomorrow", "In 3 days", "2 days ago". */
export function formatRelative(date: ISODate, today: ISODate): string {
  const diff = diffDays(today, date);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1) return `In ${diff} days`;
  return `${Math.abs(diff)} days ago`;
}

function toDate(value: ISODate | ISODateTime): Date {
  return value.length === 10 ? parseISODate(value) : new Date(value);
}
