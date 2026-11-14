import { readFileSync } from "node:fs";
import { expect, test, type Locator } from "@playwright/test";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";

// Expanded Why rows can be taller than the viewport. Check the ink rectangle,
// including the horizontal container clip, instead of the whole tall td box.
async function revealCellText(cell: Locator) {
  await expect(cell).toBeVisible();
  const visible = await cell.evaluate((el) => {
    el.scrollIntoView({
      block: "start",
      inline: "center",
      behavior: "instant"
    });
    const range = document.createRange();
    range.selectNodeContents(el);
    const container = el
      .closest("table")!
      .parentElement!.getBoundingClientRect();
    const clip = {
      left: Math.max(0, container.left),
      right: Math.min(innerWidth, container.right),
      top: Math.max(0, container.top),
      bottom: Math.min(innerHeight, container.bottom)
    };
    const rectangles = [...range.getClientRects()].filter(
      (r) => r.width > 0 && r.height > 0
    );
    return (
      rectangles.length > 0 &&
      rectangles.every(
        (r) =>
          r.left >= clip.left - 0.5 &&
          r.right <= clip.right + 0.5 &&
          r.top >= clip.top - 0.5 &&
          r.bottom <= clip.bottom + 0.5
      )
    );
  });
  expect(visible).toBe(true);
}

test("continued block traits expose ordinary push alternatives and measured zero without extra luck", async ({
  page
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type())) errors.push(m.text());
  });
  const input = readFileSync("demo-replays/demo9.bbr", "utf8"),
    report = analyzeNufflizerInput(input);
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
  await page.setInputFiles('input[name="replay"]', {
    name: "source9.bbr",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(input)
  });
  await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
  await expect(
    page.getByRole("heading", { name: "Nuffle Match Report" })
  ).toBeVisible();
  await page.getByLabel("Category", { exact: true }).selectOption("block");
  await page.getByLabel("Scoring status").selectOption("scored");
  const pushed = page
    .locator("tbody tr")
    .filter({ hasText: "Source: source-313;" });
  await expect(pushed).toHaveCount(1);
  await pushed.locator("summary").click();
  await expect(pushed).toContainText(
    "recorded menu offers 2 destination squares"
  );
  await expect(pushed).toContainText("4 position branches");
  await expect(pushed).toContainText(
    "player 8 [12,5] to [11,6]; the blocker followed"
  );
  await expect(pushed).toContainText(
    "These coach choices carry no random probability or extra luck score"
  );
  await pushed.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "/tmp/nufflizier-injury-transaction-push-desktop.png"
  });
  const zero = page
    .locator("tbody tr")
    .filter({ hasText: "Source: source-501;" });
  await expect(zero).toHaveCount(1);
  await expect(zero.locator("td").nth(4)).toHaveText("Offered balance 0");
  await expect(zero.locator("td").nth(5)).toHaveText("0.000");
  await page.getByLabel("Scoring status").selectOption("excluded");
  await expect(zero).toHaveCount(0);
  await page.getByLabel("Scoring status").selectOption("scored");
  await zero.locator("summary").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await zero.locator("summary").scrollIntoViewIfNeeded();
  await revealCellText(zero.locator("td").nth(5));
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "/tmp/nufflizier-injury-transaction-push-mobile.png"
  });
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).click();
  const saved = JSON.parse(
    readFileSync((await (await pending).path())!, "utf8")
  );
  expect(
    saved.events.find(
      (e: { metadata: { sourceId: string } }) =>
        e.metadata.sourceId === "source-313"
    ).metadata.blockPush
  ).toEqual(
    report.events.find((e) => e.metadata.sourceId === "source-313")!.metadata
      .blockPush
  );
  expect(
    saved.events.find(
      (e: { metadata: { sourceId: string } }) =>
        e.metadata.sourceId === "source-625"
    ).metadata.block.traitEvidence.defender.observedCheckpointAfter
  ).toBe(12);
  expect(
    saved.events.find(
      (e: { metadata: { sourceId: string } }) =>
        e.metadata.sourceId === "source-501"
    ).weightedDelta
  ).toBe(0);
  expect(saved.verdict.luckierTeam).toBe("unknown");
  expect(
    saved.teams.every((t: { impactCount: number }) => t.impactCount === 0)
  ).toBe(true);
  expect(await page.locator("nextjs-portal").count()).toBe(0);
  await page.getByRole("button", { name: "Reset filters" }).click();
  await page.getByRole("button", { name: "Upload Another Replay" }).click();
  await expect(page.getByLabel("Scoring status")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("qualified Stunty injury and its SPP recipient stay separate on desktop, mobile and export", async ({
  page
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type())) errors.push(m.text());
  });
  const input = readFileSync("demo-replays/demo6.bbr", "utf8"),
    report = analyzeNufflizerInput(input);
  // Existing demo6 HTTP/CLI cases exercise actual bounded workers. This view
  // consumes that same complete source report without an eleventh HTTP POST.
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
    name: "source6.bbr",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(input)
  });
  await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
  await expect(
    page.getByRole("heading", { name: "Nuffle Match Report" })
  ).toBeVisible();
  await page.getByLabel("Player ID or initial roster name").fill("47");
  await page.getByLabel("Category", { exact: true }).selectOption("injury");
  await page.getByLabel("Scoring status").selectOption("scored");
  const injury = page
    .locator("tbody tr")
    .filter({ hasText: "Source: source-248;" });
  await expect(injury).toHaveCount(1);
  await expect(injury.locator("td").nth(3)).toHaveText("Categorical");
  await expect(injury.locator("td").nth(4)).toHaveText("Badly Hurt (recorded)");
  await expect(injury.locator("td").nth(5)).toHaveText("-1.083");
  await injury.locator("summary").click();
  await expect(injury).toContainText(
    "Recorded SPP notification source-247 sits between this armor and injury roll"
  );
  await expect(injury).toContainText(
    "adds no random draw, modifier or injury value"
  );
  await expect(injury).toContainText(
    "Subject skills Right Stuff affect other actions"
  );
  await expect(injury).toContainText(
    "Stunty; Stunned 15/36 (41.7%), KO 11/36 (30.6%), Badly Hurt 4/36 (11.1%), Casualty 6/36 (16.7%)"
  );
  await expect(injury).toContainText(
    "Treatment, recovery and match impact remain separate"
  );
  await injury.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "/tmp/nufflizier-injury-transaction-desktop.png"
  });
  await page.getByLabel("Scoring status").selectOption("excluded");
  await expect(injury).toHaveCount(0);
  await page.getByLabel("Scoring status").selectOption("scored");
  await injury.locator("summary").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await injury.locator("summary").scrollIntoViewIfNeeded();
  await revealCellText(injury.locator("td").nth(5));
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "/tmp/nufflizier-injury-transaction-mobile.png"
  });
  await page.getByLabel("Player ID or initial roster name").fill("8");
  await page.getByLabel("Category", { exact: true }).selectOption("unknown");
  await page.getByLabel("Scoring status").selectOption("excluded");
  const spp = page
    .locator("tbody tr")
    .filter({ hasText: "Source: source-247;" });
  await expect(spp).toHaveCount(1);
  await revealCellText(spp.locator("td").nth(4));
  await expect(spp.locator("td").nth(3)).toHaveText("No new roll");
  await expect(spp.locator("td").nth(4)).toHaveText("Recorded +2 SPP");
  await expect(spp.locator("td").nth(5)).toHaveText("Not scored");
  await spp.locator("summary").click();
  await expect(spp).toContainText("Recorded two SPP");
  await page.getByLabel("Scoring status").selectOption("scored");
  await expect(spp).toHaveCount(0);
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).click();
  const saved = JSON.parse(
    readFileSync((await (await pending).path())!, "utf8")
  );
  expect(saved.schemaVersion).toBe("2.67");
  expect(saved.modelVersion).toBe("dice-only-35");
  for (const id of ["source-248", "source-247", "source-3956"]) {
    expect(
      saved.events.find(
        (e: { metadata: { sourceId: string } }) => e.metadata.sourceId === id
      )
    ).toEqual(report.events.find((e) => e.metadata.sourceId === id));
  }
  expect(saved.verdict.luckierTeam).toBe("unknown");
  expect(
    saved.teams.every((t: { impactCount: number }) => t.impactCount === 0)
  ).toBe(true);
  expect(await page.locator("nextjs-portal").count()).toBe(0);
  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(page.getByLabel("Player ID or initial roster name")).toHaveValue(
    ""
  );
  await page.getByRole("button", { name: "Upload Another Replay" }).click();
  await expect(page.getByLabel("Scoring status")).toHaveCount(0);
  expect(errors).toEqual([]);
});
