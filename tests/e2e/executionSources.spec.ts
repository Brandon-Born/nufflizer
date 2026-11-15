import { readFileSync } from "node:fs";
import { test, expect, type Locator } from "@playwright/test";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { playbackFragmentXml } from "../helpers/playback";
import { appendExecutionProbe } from "../helpers/executionSources";

// Prove the text is inside the table clip after ordinary horizontal navigation.
async function revealCellText(cell: Locator) {
  const visible = await cell.evaluate((el) => {
    el.scrollIntoView({
      block: "start",
      inline: "center",
      behavior: "instant"
    });
    const range = document.createRange();
    range.selectNodeContents(el);
    const clip = el.closest("table")!.parentElement!.getBoundingClientRect();
    const rects = [...range.getClientRects()].filter(
      (r) => r.width && r.height
    );
    return (
      rects.length > 0 &&
      rects.every(
        (r) =>
          r.left >= Math.max(0, clip.left) - 0.5 &&
          r.right <= Math.min(innerWidth, clip.right) + 0.5 &&
          r.top >= Math.max(0, clip.top) - 0.5 &&
          r.bottom <= Math.min(innerHeight, clip.bottom) + 0.5
      )
    );
  });
  expect(visible).toBe(true);
}

// Browser plugin unavailable; run this fixture view after isolated real uploads.
test("evaluated damage remains inspectable without changing earlier actual dice luck", async ({
  page
}) => {
  const input = appendExecutionProbe(
      playbackFragmentXml("001", "UI-009", [], [38]),
      38,
      1,
      1
    ),
    report = analyzeNufflizerInput(input),
    errors: string[] = [];
  const armor = report.events.filter((e) => e.type === "armor_break"),
    actual = armor[0]!,
    evaluated = armor.at(-1)!;
  expect(actual.scoringStatus).toBe("scored");
  expect(actual.weightedDelta).toBeCloseTo(-21 / 36, 12);
  expect(evaluated).toMatchObject({
    scoringStatus: "excluded",
    probabilitySuccess: null,
    actualSuccess: null,
    weightedDelta: 0
  });
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
  ).toBeVisible();
  await page
    .getByLabel("Category", { exact: true })
    .selectOption("armor_break");
  await page.getByLabel("Player ID or initial roster name").fill("38");
  await page.getByLabel("Scoring status").selectOption("excluded");
  const row = page
    .locator("tbody tr")
    .filter({ hasText: `Source: ${evaluated.metadata.sourceId};` });
  await expect(row).toHaveCount(1);
  await expect(row.locator("td").nth(3)).toHaveText("Unknown");
  await expect(row.locator("td").nth(4)).toHaveText("Unknown");
  await expect(row.locator("td").nth(5)).toHaveText("Not scored");
  await row.locator("summary").click();
  await expect(row).toContainText(
    "the replay marks this step as an evaluation"
  );
  await row.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/nufflizier-execution-desktop.png" });
  await page.getByLabel("Scoring status").selectOption("under_review");
  await expect(row).toHaveCount(0);
  // dice-only-37 exposes the earlier qualified self-fall, not evaluated damage.
  await page.getByLabel("Scoring status").selectOption("scored");
  await expect(row).toHaveCount(0);
  await expect(
    page
      .locator("tbody tr")
      .filter({ hasText: `Source: ${actual.metadata.sourceId};` })
  ).toHaveCount(1);
  await page.getByLabel("Scoring status").selectOption("excluded");
  await row.locator("summary").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await row.scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "/tmp/nufflizier-execution-mobile.png" });
  for (const column of [3, 4, 5]) {
    await revealCellText(row.locator("td").nth(column));
  }
  await page.screenshot({ path: "/tmp/nufflizier-execution-mobile-odds.png" });
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).click();
  const saved = JSON.parse(
    readFileSync((await (await pending).path())!, "utf8")
  );
  expect(saved).toEqual(report);
  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(page.getByLabel("Player ID or initial roster name")).toHaveValue(
    ""
  );
  await page.getByRole("button", { name: "Upload Another Replay" }).click();
  await expect(page.getByLabel("Scoring status")).toHaveCount(0);
  expect(await page.locator("nextjs-portal").count()).toBe(0);
  expect(errors).toEqual([]);
});
