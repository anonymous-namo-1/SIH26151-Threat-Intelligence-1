import type { Request } from "express";
import { getAuth } from "@clerk/express";
import { randomBytes } from "node:crypto";
import { buildIdentityProof } from "./gatewayProof";

const internalPort = process.env.ARGUS_INTERNAL_PORT || "8002";
const internalOrigin = `http://${process.env.ARGUS_INTERNAL_HOST || "127.0.0.1"}:${internalPort}`;
const maxUpstreamBytes = 8 * 1024 * 1024;

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
  const requestId = String(req.id);
  const { identity, signature } = buildIdentityProof({
    sub: auth.userId,
    name: typeof auth.sessionClaims?.name === "string" ? auth.sessionClaims.name : "Investigator",
    expiresAt: Math.floor(Date.now() / 1000) + 30,
    method,
    path,
    scope,
    body: serializedBody,
    nonce: randomBytes(24).toString("base64url"),
    requestId,
  }, secret);
  return fetch(`${internalOrigin}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Argus-Identity": identity,
      "X-Argus-Signature": signature,
      "X-Request-ID": requestId,
    },
    body: body === undefined ? undefined : serializedBody,
    signal: AbortSignal.timeout(30_000),
    redirect: "error",
  });
}

export async function readBoundedResponse(response: Response, limit = maxUpstreamBytes): Promise<Buffer> {
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit)) {
    await response.body?.cancel();
    throw new GatewayError(502, "The upstream response exceeded the gateway limit.");
  }
  if (!response.body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const bytes = Buffer.from(value);
    total += bytes.length;
    if (total > limit) {
      await reader.cancel();
      throw new GatewayError(502, "The upstream response exceeded the gateway limit.");
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, total);
}

export async function requireJson<T>(response: Response): Promise<T> {
  let data: unknown;
  try {
    data = JSON.parse((await readBoundedResponse(response)).toString("utf8"));
  } catch (error) {
    if (error instanceof GatewayError) throw error;
    throw new GatewayError(502, "The upstream returned an invalid response.");
  }
  if (!response.ok) {
    const detail = data && typeof data === "object" && "detail" in data ? data.detail : null;
    throw new GatewayError(
      response.status,
      typeof detail === "string" ? detail : "The request could not be completed.",
    );
  }
  return data as T;
}

export async function checkArgusReadiness(): Promise<boolean> {
  try {
    const response = await fetch(`${internalOrigin}/ready`, {
      signal: AbortSignal.timeout(3_000),
      redirect: "error",
    });
    await readBoundedResponse(response, 64 * 1024);
    return response.ok;
  } catch {
    return false;
  }
}