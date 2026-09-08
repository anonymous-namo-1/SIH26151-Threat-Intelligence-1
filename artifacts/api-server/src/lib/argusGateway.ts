import type { Request } from "express";
import { getAuth } from "@clerk/express";
import { buildIdentityProof } from "./gatewayProof";

const internalPort = process.env.ARGUS_INTERNAL_PORT || "8002";
const internalOrigin = `http://${process.env.ARGUS_INTERNAL_HOST || "127.0.0.1"}:${internalPort}`;

export class GatewayError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Clerk authenticates the browser; this proof authenticates the private hop only. */
export async function callArgus(
  req: Request,
  path: string,
  method = "GET",
  body?: unknown,
  scope: "public" | "broker" = "public",
): Promise<Response> {
  const auth = getAuth(req);
  if (!auth.userId) throw new GatewayError(401, "Sign in to continue.");
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new GatewayError(503, "Internal authentication is not configured.");
  if (!path.startsWith("/api/argus/")) throw new GatewayError(400, "Invalid API path.");
  const serializedBody = body === undefined ? "" : JSON.stringify(body);
  const { identity, signature } = buildIdentityProof({
    sub: auth.userId,
    name: typeof auth.sessionClaims?.name === "string" ? auth.sessionClaims.name : "Investigator",
    expiresAt: Math.floor(Date.now() / 1000) + 30,
    method,
    path,
    scope,
    body: serializedBody,
  }, secret);
  return fetch(`${internalOrigin}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Argus-Identity": identity,
      "X-Argus-Signature": signature,
    },
    body: body === undefined ? undefined : serializedBody,
    signal: AbortSignal.timeout(30_000),
    redirect: "error",
  });
}

export async function requireJson<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    const detail = data && typeof data === "object" && "detail" in data ? data.detail : null;
    throw new GatewayError(
      response.status,
      typeof detail === "string" ? detail : "The request could not be completed.",
    );
  }
  return data as T;
}