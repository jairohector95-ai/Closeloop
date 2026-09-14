/** Tiny className joiner. Falsy values are skipped. */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}
