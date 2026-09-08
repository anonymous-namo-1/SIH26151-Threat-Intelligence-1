import { createHash, createHmac } from "node:crypto";

export function publicRouteAllowed(path: string): boolean {
  return /^\/[a-zA-Z0-9/-]*$/.test(path) && !path.startsWith("/uploads");
}

export function buildIdentityProof(input: {
  sub: string; name: string; path: string; method: string; body: string;
  scope: "public" | "broker"; expiresAt: number;
}, key: string) {
  const identity = Buffer.from(JSON.stringify({
    sub: input.sub, name: input.name, exp: input.expiresAt,
    method: input.method, path: input.path, scope: input.scope,
    body_sha256: createHash("sha256").update(input.body).digest("hex"),
  })).toString("base64url");
  return { identity, signature: createHmac("sha256", key).update(identity).digest("hex") };
}