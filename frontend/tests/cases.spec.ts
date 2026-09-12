import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

test("create a demo investigation, ingest supplied text, and persist its graph", async ({
  page,
}) => {
  await page.goto("/cases");
  await page.getByRole("button", { name: "New case", exact: true }).click();
  await page
    .getByLabel("Case title", { exact: true })
    .fill("Verification investigation");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Synthetic browser verification of supplied evidence.");
  await page.getByRole("button", { name: "Create case", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Case created");
  await page
    .getByRole("link", { name: "Open Verification investigation", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Verification investigation",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Add intelligence", exact: true })
    .click();
  await page
    .getByLabel("Platform / source", { exact: true })
    .fill("Synthetic verification fixture");
  await page.getByLabel("Handle", { exact: true }).fill("test_analyst");
  await page
    .getByLabel("Source text", { exact: false })
    .fill(
      "Actor: TESTBIRD. Alias: test_alias. Contact: @testbird_ops. Domain: testbird.example. IP: 203.0.113.88. Fictional analyst-supplied evidence only.",
    );
  await page
    .getByRole("button", { name: "Extract entities", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    /Source added · \d+ entities extracted/,
  );
  await expect(page.locator(".sec-list")).toContainText("testbird.example");
  await page.getByRole("link", { name: /Explore updated graph/ }).click();
  await expect(page.locator(".react-flow__node").first()).toBeVisible();
  await expect(
    page.getByRole("group", { name: "TESTBIRD, Threat actor", exact: true }),
  ).toBeVisible();
  const nodeCount = await page.locator(".react-flow__node").count();
  expect(nodeCount).toBeGreaterThan(4);
  await page.reload();
  await expect(page.locator(".react-flow__node")).toHaveCount(nodeCount);
  await expect(
    page.getByRole("heading", {
      name: "Verification investigation",
      exact: true,
    }),
  ).toBeVisible();
});

test("secondary workspaces render their content and export current evidence", async ({
  page,
}) => {
  const caseRoot = "/cases/ARG-2026-084";
  for (const [route, heading] of [
    ["/cases", "Case directory"],
    [caseRoot, "Operation Nightfall"],
    [`${caseRoot}/ingest`, "Add intelligence"],
    [`${caseRoot}/entities`, "Entity registry"],
    [`${caseRoot}/ai-profile`, "Behavioral intelligence"],
    [`${caseRoot}/infrastructure`, "Infrastructure findings"],
    ["/settings", "Workspace settings"],
    [`${caseRoot}/report`, "Investigation report"],
  ]) {
    await page.goto(route);
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveClass(/dark/);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
  }
  const jsonDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  expect((await jsonDownload).suggestedFilename()).toMatch(/\.json$/);
  const csvDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  expect((await csvDownload).suggestedFilename()).toMatch(/-evidence\.csv$/);
});

test("mobile ingestion, profile, and report remain within the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mkdir(path.join(process.cwd(), "verification"), { recursive: true });
  for (const [suffix, heading] of [
    ["ingest", "Add intelligence"],
    ["ai-profile", "Behavioral intelligence"],
    ["report", "Investigation report"],
  ]) {
    await page.goto(`/cases/ARG-2026-084/${suffix}`);
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: path.join(process.cwd(), "verification", `mobile-${suffix}.png`),
      fullPage: true,
      animations: "disabled",
    });
  }
});
