/**
 * Reply routing.
 *
 * Every quote gets a random token at creation. Outbound follow-ups carry
 * `Reply-To: reply+<token>@<reply domain>`, so the customer just hits Reply in
 * any mail client and the reply lands on our inbound domain with the token in
 * the address. Inbound handling extracts the token and matches the quote.
 */

const LOCAL_PART = "reply";

export function replyAddressFor(token: string, replyDomain: string): string {
  return `${LOCAL_PART}+${token}@${replyDomain}`;
}

const TOKEN_PATTERN = /^reply\+([A-Za-z0-9_-]{16,})@([^@\s>]+)$/i;

/**
 * Finds the reply token in a list of recipient addresses (as delivered).
 * When `replyDomain` is given, only addresses on that domain count, so a
 * forwarded or spoofed address on another domain cannot inject a token.
 */
export function extractReplyToken(addresses: string[], replyDomain?: string | null): string | null {
  for (const raw of addresses) {
    const address = bareAddress(raw);
    const match = TOKEN_PATTERN.exec(address);
    if (!match) continue;
    if (replyDomain && match[2].toLowerCase() !== replyDomain.toLowerCase()) continue;
    return match[1];
  }
  return null;
}

/** "Name <a@b.com>" → "a@b.com" */
export function bareAddress(value: string): string {
  const match = /<([^>]+)>/.exec(value);
  return (match ? match[1] : value).trim();
}
