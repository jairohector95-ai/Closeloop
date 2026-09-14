import type { EmailMessage } from "../../types";
import { formatAddress } from "../../email/provider";

/**
 * Builds an RFC 5322 message for APIs that accept raw MIME (Gmail
 * users.messages.send expects it base64url-encoded).
 */
export function buildRawMime(message: EmailMessage, from: string, messageId: string, date: Date = new Date()): string {
  const headers: string[] = [
    `From: ${formatAddress(message.fromName, from)}`,
    `To: ${formatAddress(message.toName, message.to)}`,
    `Subject: ${encodeHeader(message.subject)}`,
    `Date: ${date.toUTCString()}`,
    `Message-ID: ${messageId}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
  ];
  if (message.replyTo && message.replyTo !== from) headers.push(`Reply-To: ${message.replyTo}`);
  if (message.inReplyTo) headers.push(`In-Reply-To: ${message.inReplyTo}`);
  if (message.references.length) headers.push(`References: ${message.references.join(" ")}`);
  return `${headers.join("\r\n")}\r\n\r\n${message.body.replace(/\r?\n/g, "\r\n")}`;
}

/** RFC 2047 encodes a header only when it contains non-ASCII characters. */
export function encodeHeader(value: string): string {
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const base64 = typeof btoa === "function" ? btoa(binary) : Buffer.from(binary, "binary").toString("base64");
  return `=?UTF-8?B?${base64}?=`;
}

export function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const base64 = typeof btoa === "function" ? btoa(binary) : Buffer.from(binary, "binary").toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Extracts the email address from "Name <addr>" or a bare address. */
export function parseAddress(value: string): { name: string | null; email: string } {
  const match = /^\s*(?:"?([^"<]*)"?\s*)?<([^>]+)>\s*$/.exec(value);
  if (match) return { name: match[1]?.trim() || null, email: match[2].trim().toLowerCase() };
  return { name: null, email: value.trim().toLowerCase() };
}
