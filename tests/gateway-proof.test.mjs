import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { publicRouteAllowed, buildIdentityProof } from "../artifacts/api-server/src/lib/gatewayProof.ts";

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
    method: "POST", body: '{"title":"Fixture"}', scope: "public", expiresAt: 123456 };
  const key = "non-secret-unit-test-fixture";
  const proof = buildIdentityProof(input, key);
  const claims = JSON.parse(Buffer.from(proof.identity, "base64url"));
  assert.equal(claims.body_sha256, createHash("sha256").update(input.body).digest("hex"));
  for (const change of [{ body: "{}" }, { scope: "broker" }, { method: "DELETE" },
    { path: "/api/argus/uploads" }, { expiresAt: 123457 }]) {
    assert.notEqual(buildIdentityProof({ ...input, ...change }, key).signature, proof.signature);
  }
  assert.notEqual(buildIdentityProof(input, "other-unit-test-fixture").signature, proof.signature);
});