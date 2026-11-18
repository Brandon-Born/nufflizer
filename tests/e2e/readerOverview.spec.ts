import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { playbackFragmentXml } from "../helpers/playback";
import { summarizeForReader } from "@/domain/nufflizer/readerSummary";

// Browser plugin unavailable; repository Playwright fixture gate after real uploads.
test("reader overview leads to exact evidence, qualified armor, export and a fresh upload", async ({
  page
}) => {
  const input = playbackFragmentXml("001", "UI-009", [], [38]);
  const report = analyzeNufflizerInput(input),
    expected = summarizeForReader(report);
  expect(expected.moments.length).toBeGreaterThan(0);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type())) errors.push(m.text());
  });
  await page.route("**/api/nufflizier/analyze", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(report)
    })
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/nufflizier");
  await expect(page).toHaveTitle("Nufflizier");
  await expect(page).toHaveURL(/\/nufflizier$/);
  await page.setInputFiles('input[name="replay"]', {
    name: "source.xml",
    mimeType: "application/xml",
    buffer: Buffer.from(input)
  });
  await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
  await expect(
    page.getByRole("heading", { name: "Nuffle Match Report" })
  ).toBeFocused();
  const overview = page.getByRole("region", { name: "Report overview" });
  await expect(overview).toBeVisible();
  await expect(overview.getByRole("heading", { name: "Failed Rush", exact: true })).toBeVisible();
  await expect(overview).toContainText(`${expected.scored}scored dice checks`);
  await expect(
    page.getByRole("complementary", { name: "Armor scoring under review" })
  ).toHaveCount(0);
  const reviewedTotals = page.getByText("Total under review", { exact: true });
  await expect(reviewedTotals).toHaveCount(0);

  await expect(
    page.getByText("Scoring details and source coverage", { exact: true })
  ).toBeVisible();
  expect(await page.locator("details").first().getAttribute("open")).toBeNull();
  await overview.getByRole("heading").first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/nufflizier-reader-desktop.png" });
  await page.getByLabel("Player ID or initial roster name").fill("no-match");
  await page.getByLabel("Category", { exact: true }).selectOption("block");
  await page
    .getByRole("button", { name: "Inspect this moment" })
    .first()
    .click();
  const source = expected.moments[0]!.event.metadata.sourceId;
  const row = page
    .locator("tbody tr")
    .filter({ hasText: `Source: ${source};` });
  await expect(row).toHaveCount(1);
  await expect(page.getByLabel("Player ID or initial roster name")).toHaveValue(
    ""
  );
  await expect(page.getByLabel("Category", { exact: true })).toHaveValue("all");
  await expect(
    page.getByRole("heading", { name: "Replay evidence" })
  ).toBeFocused();
  await row.locator("summary").click();
  await expect(row).toContainText("Source:");
  await page.getByRole("button", { name: "Back to timeline" }).click();
  await overview.getByRole("button", { name: /^Armor/ }).click();
  const armor = page
    .locator("tbody tr")
    .filter({ hasText: "Source: source-14;" });
  await expect(armor.locator("td").nth(3)).not.toHaveText("Under review");
  await expect(armor.locator("td").nth(5)).not.toHaveText("Under review");
  await armor.locator("summary").click();
  await expect(armor).toContainText("Fixed pre-roll armor policy:");
  await page.getByLabel("Scoring status").selectOption("under_review");
  await expect(armor).toHaveCount(0);
  await page.getByLabel("Scoring status").selectOption("scored");
  await expect(armor).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await overview.getByRole("heading").first().scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "/tmp/nufflizier-reader-mobile.png" });
  await page
    .getByRole("button", { name: "Inspect this moment" })
    .first()
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/nufflizier-reader-mobile-moments.png" });
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).click();
  expect(
    JSON.parse(readFileSync((await (await pending).path())!, "utf8"))
  ).toEqual(report);
  await page.getByRole("button", { name: "Upload Another Replay" }).click();
  await expect(overview).toHaveCount(0);
  await expect(page.getByLabel("Scoring status")).toHaveCount(0);
  expect(await page.locator("nextjs-portal").count()).toBe(0);
  expect(errors).toEqual([]);
});

test("legacy report responses are rejected rather than silently upgraded", async ({ page }) => {
  const input = playbackFragmentXml("001", "UI-009", [], [38]);
  const report = { ...analyzeNufflizerInput(input), modelVersion: "dice-only-36" };
  await page.route("**/api/nufflizier/analyze", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(report) }));
  await page.goto("/nufflizier");
  await page.setInputFiles('input[name="replay"]', {
    name: "legacy.xml", mimeType: "application/xml", buffer: Buffer.from(input)
  });
  await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "report format or totals are inconsistent" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nuffle Match Report" })).toHaveCount(0);
});
