import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  PUBLIC_READINESS_PATHS, publicRouteAllowed, buildIdentityProof, mutationOriginAllowed,
} from "../artifacts/api-server/src/lib/gatewayProof.ts";

test("public route allowlist rejects upload broker paths and decoding ambiguity", () => {
  for (const path of ["/uploads", "/uploads/id/finalize", "/%75ploads", "/%2575ploads",
    "/cases/../uploads", "//%75ploads", "/cases%2f../uploads", "/uploads/anything"]) {
    assert.equal(publicRouteAllowed(path), false, path);
  }
  for (const path of ["/cases", "/cases/57e75ff0-ff02-4b2a-a0c2-b7bb652e33db/graph", "/search"]) {
    assert.equal(publicRouteAllowed(path), true, path);
  }
});

test("signed internal identity binds body, scope, method, path and expiration", () => {
  const input = { sub: "fixture-subject", name: "Fixture", path: "/api/argus/cases",
    method: "POST", body: '{"title":"Fixture"}', scope: "public", expiresAt: 123456,
    nonce: "abcdefghijklmnopqrstuvwxyzABCDEFG", requestId: "80f91f77-796d-4a5d-a581-9e01d7512903" };
  const key = "non-secret-unit-test-fixture";
  const proof = buildIdentityProof(input, key);
  const claims = JSON.parse(Buffer.from(proof.identity, "base64url"));
  assert.equal(claims.body_sha256, createHash("sha256").update(input.body).digest("hex"));
  for (const change of [{ body: "{}" }, { scope: "broker" }, { method: "DELETE" },
    { path: "/api/argus/uploads" }, { expiresAt: 123457 }, { nonce: `${input.nonce}x` },
    { requestId: "cb80a448-60bb-4936-9e28-8f1efac12db1" }]) {
    assert.notEqual(buildIdentityProof({ ...input, ...change }, key).signature, proof.signature);
  }
  assert.notEqual(buildIdentityProof(input, "other-unit-test-fixture").signature, proof.signature);
});

test("mutation origin ignores spoofable forwarded host and accepts configured hosts", () => {
  const configured = ["argus.example.replit.app"];
  assert.equal(mutationOriginAllowed("https://gateway.example", "gateway.example", configured), true);
  assert.equal(mutationOriginAllowed("https://argus.example.replit.app", "internal.example", configured), true);
  assert.equal(mutationOriginAllowed("https://evil.example", "gateway.example", configured), false);
  // A caller-controlled x-forwarded-host is deliberately not an input.
  assert.equal(mutationOriginAllowed("https://spoofed.example", "gateway.example", configured), false);
  assert.equal(mutationOriginAllowed("javascript://gateway.example", "gateway.example", configured), false);
});

test("readiness is exposed at root and OpenAPI server-prefixed paths", () => {
  assert.deepEqual([...PUBLIC_READINESS_PATHS], ["/ready", "/api/ready"]);
  assert.equal(new Set(PUBLIC_READINESS_PATHS).size, PUBLIC_READINESS_PATHS.length);
});