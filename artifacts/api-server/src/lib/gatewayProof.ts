import { createHash, createHmac } from "node:crypto";

export const PUBLIC_READINESS_PATHS = ["/ready", "/api/ready"] as const;

export function publicRouteAllowed(path: string): boolean {
  return /^\/[a-zA-Z0-9/-]*$/.test(path) && !path.startsWith("/uploads");
}

export function buildIdentityProof(input: {
  sub: string; name: string; path: string; method: string; body: string;
  scope: "public" | "broker"; expiresAt: number; nonce: string; requestId: string;
}, key: string) {
  const identity = Buffer.from(JSON.stringify({
    sub: input.sub, name: input.name, exp: input.expiresAt,
    method: input.method, path: input.path, scope: input.scope,
    nonce: input.nonce, request_id: input.requestId,
    body_sha256: createHash("sha256").update(input.body).digest("hex"),
  })).toString("base64url");
  return { identity, signature: createHmac("sha256", key).update(identity).digest("hex") };
}

function normalizedHost(value: string): string | null {
  try {
    const url = new URL(`http://${value}`);
    return url.pathname === "/" && !url.username && !url.password ? url.host.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Mutations are same-origin only. In particular, x-forwarded-host is not an
 * authority here because it can be supplied by a client before reaching
 * Express. Clerk may still use its proxy host for authentication discovery.
 */
export function mutationOriginAllowed(
  origin: string | undefined,
  directHost: string | undefined,
  configuredHosts: readonly string[],
): boolean {
  if (!origin) return false;
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }
  if (!["http:", "https:"].includes(originUrl.protocol) ||
      originUrl.username || originUrl.password ||
      originUrl.pathname !== "/" || originUrl.search || originUrl.hash) {
    return false;
  }
  const allowed = new Set(
    [directHost, ...configuredHosts].flatMap((value) => {
      if (!value) return [];
      const host = normalizedHost(value.trim());
      return host ? [host] : [];
    }),
  );
  return allowed.has(originUrl.host.toLowerCase());
}