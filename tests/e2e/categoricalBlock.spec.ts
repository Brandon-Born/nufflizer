import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";

test("categorical block positives, negatives and unknown pools share timeline/export semantics", async ({
  page
}) => {
  const input = readFileSync("demo-replays/demo5.bbr", "utf8");
  const report = analyzeNufflizerInput(input);
  // The existing demo5 HTTP test uses the actual bounded worker. This view
  // consumes that same report without another admission to its ten-POST gate.
  await page.route("**/api/nufflizier/analyze", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(report)
    })
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type())) errors.push(m.text());
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/nufflizier");
  await expect(page).toHaveTitle("Nufflizier");
  await expect(page).toHaveURL(/\/nufflizier$/);
  await page.setInputFiles('input[name="replay"]', {
    name: "source.bbr",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(input)
  });
  await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
  await expect(
    page.getByRole("heading", { name: "Nuffle Match Report" })
  ).toBeVisible();
  await page.getByLabel("Category", { exact: true }).selectOption("block");
  await page.getByLabel("Player ID or initial roster name").fill("5");
  const table = page.getByRole("table").filter({
    has: page.getByRole("columnheader", { name: "Replay segment" })
  });
  const negative = table
    .locator("tbody tr")
    .filter({ hasText: "Source: source-132;" });
  await expect(negative).toHaveCount(1);
  await negative.locator("summary").click();
  await expect(negative).toContainText("Categorical");
  await expect(negative).toContainText("Offered balance 0");
  await expect(negative).toContainText("-0.396");
  await expect(negative).toContainText("included once in dice totals");
  await expect(negative).toContainText("expected balance is 0.528");
  await expect(negative).toContainText(
    "not the coach's actual choice or tactical impact"
  );
  await negative.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "/tmp/nufflizier-categorical-block-negative-desktop.png"
  });
  await page.getByLabel("Scoring status").selectOption("excluded");
  await page.getByLabel("Player ID or initial roster name").fill("38");
  const recoveredTraits = table
    .locator("tbody tr")
    .filter({ hasText: "Source: source-2025;" });
  await recoveredTraits.locator("summary").click();
  await expect(recoveredTraits).toContainText(
    "Intrinsic skill evidence for attacker 38 and defender 1"
  );
  await expect(recoveredTraits).toContainText("Not scored");
  await page.getByLabel("Player ID or initial roster name").fill("3");
  const unknown = table
    .locator("tbody tr")
    .filter({ hasText: "Source: source-261;" });
  await expect(unknown).toHaveCount(1);
  await unknown.locator("summary").click();
  await expect(unknown).toContainText("Observed symbols");
  await expect(unknown).toContainText("Not scored");
  await expect(unknown).toContainText("skill-conditioned outcome odds unknown");
  await expect(unknown).toContainText(
    "defender 37 was pushed and knocked down"
  );
  await expect(unknown).toContainText("not an even-luck result");
  await expect(unknown).toContainText("Block dice luck is assessed separately");
  await expect(unknown).toContainText("excluded");
  await page.setViewportSize({ width: 390, height: 844 });
  await unknown.locator("td").nth(2).scrollIntoViewIfNeeded();
  await expect(
    unknown.getByText(/The block pool has no qualified luck value/)
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "/tmp/nufflizier-categorical-block-unknown-mobile.png"
  });
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).click();
  const file = await pending,
    saved = JSON.parse(readFileSync((await file.path())!, "utf8"));
  expect(saved.schemaVersion).toBe("2.103");
  expect(
    saved.events.find(
      (e: { metadata: { sourceId: string } }) =>
        e.metadata.sourceId === "source-132"
    ).weightedDelta
  ).toBeCloseTo(-19 / 48, 12);
  expect(
    saved.events.find(
      (e: { metadata: { sourceId: string } }) =>
        e.metadata.sourceId === "source-987"
    ).weightedDelta
  ).toBeCloseTo(17 / 48, 12);
  expect(
    saved.events.find(
      (e: { metadata: { sourceId: string } }) =>
        e.metadata.sourceId === "source-261"
    ).metadata.blockResolution.unscoredPool
  ).toBe(true);
  expect(
    saved.events.find(
      (e: { metadata: { sourceId: string } }) =>
        e.metadata.sourceId === "source-1152"
    ).weightedDelta
  ).toBeCloseTo(13 / 24, 12);
  const afterKo = saved.events.find(
    (e: { metadata: { sourceId: string } }) =>
      e.metadata.sourceId === "source-1011"
  );
  expect(afterKo).toMatchObject({
    playerId: "6",
    teamId: "0",
    scoringStatus: "scored"
  });
  expect(afterKo.weightedDelta).toBeCloseTo(17 / 48, 12);
  const afterSavagery = saved.events.find(
    (e: { metadata: { sourceId: string } }) =>
      e.metadata.sourceId === "source-2025"
  );
  expect(afterSavagery).toMatchObject({
    playerId: "38",
    scoringStatus: "excluded",
    metadata: {
      block: {
        traitEvidence: {
          attacker: {
            playerId: "38",
            observedCheckpointAfter: 0,
            currentCheckpointAfter: 2018
          }
        }
      }
    }
  });
  expect(saved.verdict.luckierTeam).toBe("unknown");
  expect(
    saved.teams.map((t: { impactCount: number }) => t.impactCount)
  ).toEqual([1, 1]);
  await page.getByRole("button", { name: "Upload Another Replay" }).click();
  await expect(page.getByLabel("Scoring status")).toHaveCount(0);
  expect(errors).toEqual([]);
});
