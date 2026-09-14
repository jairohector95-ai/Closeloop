import { UnauthorizedError } from "./auth";

export function json(body: unknown, init: number | ResponseInit = 200): Response {
  return Response.json(body, typeof init === "number" ? { status: init } : init);
}

export function errorResponse(error: unknown): Response {
  if (error instanceof UnauthorizedError) return json({ error: "Not signed in" }, 401);
  console.error("[api]", error instanceof Error ? error.message : error);
  return json({ error: "Something went wrong" }, 500);
}

/** Constant-time comparison for bearer secrets. */
export function secretsMatch(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (!provided || !expected || provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i += 1) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : null;
}
