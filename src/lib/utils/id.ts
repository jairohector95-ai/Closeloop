/**
 * Generates an unguessable, URL-safe token (default 24 random bytes = 32 chars,
 * 192 bits of entropy). Used for reply-routing addresses.
 */
export function createSecureToken(bytes = 24): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  let binary = "";
  for (const b of arr) binary += String.fromCharCode(b);
  const base64 = typeof btoa === "function" ? btoa(binary) : Buffer.from(binary, "binary").toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Generates a collision-resistant id with a readable prefix, e.g. "quote_8f3a...". */
export function createId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
      : Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
  return `${prefix}_${random}`;
}
