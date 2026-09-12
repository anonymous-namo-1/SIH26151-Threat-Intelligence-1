import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const verificationDirectory = path.join(process.cwd(), "verification");

async function openWorkspace(page: Page) {
  await page.goto("/dashboard");
  await expect(page.locator(".react-flow__node").first()).toBeVisible();
  await expect(page.locator(".react-flow__edge").first()).toBeAttached();
  await expect(page.locator("html")).toHaveClass(/dark/);
  // Let the initial fit-view animation finish before pointer actions and captures.
  await page.waitForTimeout(650);
}

async function expectNoHorizontalOverflow(page: Page) {
  const size = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(size.content).toBeLessThanOrEqual(size.viewport + 1);
}

async function capture(page: Page, name: string) {
  await mkdir(verificationDirectory, { recursive: true });
  await page.screenshot({
    path: path.join(verificationDirectory, name),
    fullPage: true,
    animations: "disabled",
  });
}

test("desktop graph renders visible nodes and relationships in a dark workspace", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openWorkspace(page);
  await expectNoHorizontalOverflow(page);
  const nodeCount = await page.locator(".react-flow__node").count();
  expect(nodeCount).toBeGreaterThan(5);
  const graph = await page.locator(".react-flow").boundingBox();
  expect(graph?.width).toBeGreaterThan(650);
  expect(graph?.height).toBeGreaterThan(400);
  await expect(page.locator(".react-flow__minimap")).toBeVisible();
  await capture(page, "desktop-dashboard.png");
  expect(errors).toEqual([]);
});

test("analysts can select entities, inspect all tabs, and move the panel", async ({
  page,
}) => {
  await openWorkspace(page);
  const node = page.locator(".react-flow__node").first();
  await node.click();
  const panel = page.locator(".analyst-panel");
  await expect(panel).toBeVisible();
  for (const tab of [
    "Evidence",
    "AI Profile",
    "Infrastructure",
    "Timeline",
    "Raw JSON",
    "Overview",
  ]) {
    await panel.getByRole("tab", { name: tab, exact: true }).click();
    await expect(
      panel.getByRole("tab", { name: tab, exact: true }),
    ).toHaveAttribute("aria-selected", "true");
  }

  const before = await panel.boundingBox();
  const handle = await page
    .getByLabel("Analyst panel drag handle")
    .boundingBox();
  expect(before).not.toBeNull();
  expect(handle).not.toBeNull();
  await page.mouse.move(
    handle!.x + handle!.width / 2,
    handle!.y + handle!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    handle!.x + handle!.width / 2 - 150,
    handle!.y + handle!.height / 2 + 40,
    { steps: 12 },
  );
  await page.mouse.up();
  const after = await panel.boundingBox();
  expect(after!.x).toBeLessThan(before!.x - 80);
  const resize = await page
    .getByLabel("Resize analyst panel", { exact: true })
    .boundingBox();
  expect(resize).not.toBeNull();
  await page.mouse.move(
    resize!.x + resize!.width / 2,
    resize!.y + resize!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    resize!.x + resize!.width / 2 + 70,
    resize!.y + resize!.height / 2 - 40,
    { steps: 12 },
  );
  await page.mouse.up();
  expect((await panel.boundingBox())!.width).toBeGreaterThan(after!.width + 30);
  await capture(page, "desktop-inspector-moved.png");

  await panel
    .getByRole("button", { name: "Close analyst panel", exact: true })
    .click();
  await expect(panel).not.toBeVisible();
  await page
    .getByRole("button", { name: "Show analyst panel", exact: true })
    .click();
  await expect(panel).toBeVisible();
});

test("zoom controls and case switching preserve a usable graph", async ({
  page,
}) => {
  await openWorkspace(page);
  const viewport = page.locator(".react-flow__viewport");
  const transform = await viewport.getAttribute("style");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect.poll(() => viewport.getAttribute("style")).not.toBe(transform);
  await page.getByRole("button", { name: "Fit graph", exact: true }).click();
  await expect(page.locator(".react-flow__node").first()).toBeVisible();
  const selector = page.getByLabel("Select case", { exact: true });
  const cases = await selector
    .locator("option:not([disabled])")
    .evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value),
    );
  expect(cases.length).toBeGreaterThan(1);
  await selector.selectOption(cases[1]);
  await expect(selector).toHaveValue(cases[1]);
  await expect(page.locator(".react-flow__node")).toHaveCount(0);
  await selector.selectOption(cases[0]);
  await expect(page.locator(".react-flow__node").first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("global search opens the selected entity in the graph inspector", async ({
  page,
}) => {
  await openWorkspace(page);
  await page
    .getByLabel("Search case entities", { exact: true })
    .fill("NIGHTSHADE");
  await page
    .locator(".search-results")
    .getByRole("button", { name: /NIGHTSHADE/ })
    .click();
  await expect(page).toHaveURL(/\/cases\/ARG-2026-084\/graph\?node=malware$/);
  await expect(page.locator(".analyst-panel")).toContainText("NIGHTSHADE");
  await expect(page.locator(".search-results")).not.toBeVisible();
});

test("relationship selection exposes confidence and supporting evidence", async ({
  page,
}) => {
  await openWorkspace(page);
  const edgePath = page.locator(
    '.react-flow__edge[data-id="nightjar--alias-ghost"] .react-flow__edge-interaction',
  );
  await expect(edgePath).toBeAttached();
  const point = await edgePath.evaluate((element) => {
    const pathElement = element as SVGPathElement;
    const midpoint = pathElement.getPointAtLength(
      pathElement.getTotalLength() * 0.6,
    );
    const point = new DOMPoint(midpoint.x, midpoint.y).matrixTransform(
      pathElement.getScreenCTM()!,
    );
    return { x: point.x, y: point.y };
  });
  await page.mouse.click(point.x, point.y);
  const panel = page.locator(".analyst-panel");
  await expect(panel).toContainText("93%");
  await expect(panel).toContainText(/possible alias/i);
  await panel.getByRole("tab", { name: "Evidence", exact: true }).click();
  await expect(panel).toContainText(/PGP fingerprint/i);
  await capture(page, "desktop-relationship-evidence.png");
});

test("confidence and entity filters update visible graph data", async ({
  page,
}) => {
  await openWorkspace(page);
  const originalEdgeCount = await page.locator(".react-flow__edge").count();
  await page
    .getByRole("button", { name: "Toggle high confidence connections" })
    .click();
  await expect(
    page.getByRole("button", { name: "Toggle high confidence connections" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() => page.locator(".react-flow__edge").count())
    .toBeLessThan(originalEdgeCount);
  await page.getByRole("button", { name: "Filter graph", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Threat actor", exact: true })
    .uncheck();
  await expect(
    page.locator('.react-flow__node[data-id="nightjar"]'),
  ).toHaveCount(0);
  await page
    .getByRole("checkbox", { name: "Threat actor", exact: true })
    .check();
  await expect(
    page.locator('.react-flow__node[data-id="nightjar"]'),
  ).toBeVisible();
});

for (const viewport of [
  { width: 390, height: 844, name: "mobile" },
  { width: 768, height: 1024, name: "tablet" },
]) {
  test(`${viewport.name} graph is visible without page overflow`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await openWorkspace(page);
    await expectNoHorizontalOverflow(page);
    const canvas = await page.locator(".react-flow").boundingBox();
    expect(canvas?.width).toBeGreaterThan(viewport.width * 0.7);
    expect(canvas?.height).toBeGreaterThan(300);
    await capture(page, `${viewport.name}-dashboard.png`);
    await page.locator('.react-flow__node[data-id="nightjar"]').click();
    const panel = page.locator(".analyst-panel");
    await expect(panel).toBeVisible();
    await panel.getByRole("tab", { name: "Evidence", exact: true }).click();
    const panelBounds = await panel.boundingBox();
    expect(panelBounds!.x).toBeGreaterThanOrEqual(0);
    expect(panelBounds!.x + panelBounds!.width).toBeLessThanOrEqual(
      viewport.width + 1,
    );
    await expectNoHorizontalOverflow(page);
    await capture(page, `${viewport.name}-inspector.png`);
  });
}
