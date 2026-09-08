import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { ModuleResultView } from "../../ModuleResultView";
import type { ModuleResult } from "@workspace/api-client-react";

const fixtures: ModuleResult[] = JSON.parse(readFileSync(process.argv[2], "utf8"));
const failures: string[] = [];
for (const result of fixtures) {
  try {
  const html = renderToStaticMarkup(React.createElement(Router, { ssrPath: "/analysis" },
    React.createElement(ModuleResultView, { result })));
  assert(html.length > 100, `${result.module} must render an explanation`);
  assert(!html.includes('href="/evidence/'), "Evidence citations must use the existing query route");
  if (result.module === "wallet" && result.data.transaction_count) {
    assert(html.includes("0.123456789123456789"), "Exact amount must survive rendering");
    assert(html.includes("fictional-A"), "Counterparty node must be rendered");
  }
  console.log(`rendered ${result.module}: ${result.evidence_ids.length} citations`);
  } catch (error) {
    failures.push(`${result.module}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
assert.deepEqual(failures, [], failures.join("\n"));