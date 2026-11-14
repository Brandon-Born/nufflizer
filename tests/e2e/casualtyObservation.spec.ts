import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";

// Browser plugin not available; repository production Playwright workflow.
async function revealText(cell: Locator) {
  const visible = await cell.evaluate((el) => {
    el.scrollIntoView({
      block: "start",
      inline: "center",
      behavior: "instant"
    });
    const r = document.createRange();
    r.selectNodeContents(el);
    const box = el.closest("table")!.parentElement!.getBoundingClientRect();
    const rects = [...r.getClientRects()].filter((r) => r.width && r.height);
    return (
      rects.length > 0 &&
      rects.every(
        (r) =>
          r.left >= Math.max(0, box.left) - 0.5 &&
          r.right <= Math.min(innerWidth, box.right) + 0.5 &&
          r.top >= Math.max(0, box.top) - 0.5 &&
          r.bottom <= Math.min(innerHeight, box.bottom) + 0.5
      )
    );
  });
  expect(visible).toBe(true);
}
async function openReport(page: Page, file: string) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (["warning", "error"].includes(m.type())) errors.push(m.text());
  });
  const input = readFileSync(`demo-replays/${file}.bbr`, "utf8"),
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
  await expect(page).toHaveURL(/\/nufflizier$/);
  await page.setInputFiles('input[name="replay"]', {
    name: `${file}.bbr`,
    mimeType: "application/octet-stream",
    buffer: Buffer.from(input)
  });
  await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
  await expect(
    page.getByRole("heading", { name: "Nuffle Match Report" })
  ).toBeVisible();
  return { report, errors };
}
const row = (page: Page, source: string) =>
  page.locator("tbody tr").filter({ hasText: `Source: ${source};` });
async function exported(page: Page) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).click();
  return JSON.parse(readFileSync((await (await pending).path())!, "utf8"));
}

test("casualty originals, replacements and applied treatment stay distinct on desktop and mobile", async ({
  page
}) => {
  const { report, errors } = await openReport(page, "demo3");
  await page.getByLabel("Player ID or initial roster name").fill("13");
  await page.getByLabel("Category", { exact: true }).selectOption("injury");
  await page.getByLabel("Scoring status").selectOption("excluded");
  const pendingInitial=row(page,"source-628");
  await expect(pendingInitial).toHaveCount(1);
  await expect(pendingInitial.locator("td").nth(3)).toHaveText("Unknown");
  await expect(pendingInitial.locator("td").nth(5)).toHaveText("Not scored");
  expect(report.events.find(e=>e.metadata.sourceId==="source-628")?.metadata.initialInjuryOriginal).toBeUndefined();
  await page.getByLabel("Player ID or initial roster name").fill("45");
  await page.getByLabel("Category", { exact: true }).selectOption("injury");
  await page.getByLabel("Scoring status").selectOption("excluded");
  const original = row(page, "source-2033"),
    replacement = row(page, "source-2039"),
    applied = row(page, "source-2043");
  for (const [r, name] of [
    [original, "Serious Injury (recorded)"],
    [replacement, "No injury (recorded)"],
    [applied, "No injury (applied)"]
  ] as const) {
    await expect(r).toHaveCount(1);
    await expect(r.locator("td").nth(4)).toHaveText(name);
    await expect(r.locator("td").nth(5)).toHaveText("Not scored");
  }
  await expect(original.locator("td").nth(3)).toHaveText("Unknown");
  await expect(replacement.locator("td").nth(3)).toHaveText("Unknown");
  await expect(applied.locator("td").nth(3)).toHaveText("No new roll");
  await replacement.locator("summary").click();
  await expect(replacement).toContainText(
    "copied outcome cannot rename the original"
  );
  await expect(replacement).toContainText("no luck contribution is assigned");
  await applied.locator("summary").click();
  await expect(applied).toContainText(
    "applied the replacement casualty: No injury"
  );
  await expect(applied).toContainText(
    "Original source source-2033; replacement source source-2039"
  );
  await applied
    .locator("p")
    .filter({ hasText: "Recorded Apothecary decision:" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "/tmp/nufflizier-casualty-treatment-desktop.png"
  });
  await page.getByLabel("Scoring status").selectOption("scored");
  await expect(original).toHaveCount(0);
  await expect(replacement).toHaveCount(0);
  await expect(applied).toHaveCount(0);
  await page.getByLabel("Scoring status").selectOption("excluded");
  await replacement.locator("summary").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await replacement
    .locator("p")
    .filter({ hasText: "The recorded casualty result" })
    .scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "/tmp/nufflizier-casualty-treatment-mobile.png"
  });
  await revealText(replacement.locator("td").nth(4));
  const saved = await exported(page);
  expect(saved.schemaVersion).toBe("2.71");
  expect(saved.modelVersion).toBe("dice-only-35");
  for (const id of ["source-2033", "source-2039", "source-2043"])
    expect(
      saved.events.find(
        (e: { metadata: { sourceId: string } }) => e.metadata.sourceId === id
      )
    ).toEqual(report.events.find((e) => e.metadata.sourceId === id));
  expect(saved.diceRecords).toEqual(report.diceRecords);
  expect(saved.verdict.luckierTeam).toBe("unknown");
  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(page.getByLabel("Player ID or initial roster name")).toHaveValue(
    ""
  );
  await page.getByRole("button", { name: "Upload Another Replay" }).click();
  await expect(page.getByLabel("Scoring status")).toHaveCount(0);
  expect(await page.locator("nextjs-portal").count()).toBe(0);
  expect(errors).toEqual([]);
});

test("a lasting casualty label adds no score while its separate Regeneration remains scored", async ({
  page
}) => {
  const { report, errors } = await openReport(page, "demo9");
  await page.getByLabel("Player ID or initial roster name").fill("43");
  await page.getByLabel("Category", { exact: true }).selectOption("injury");
  await page.getByLabel("Scoring status").selectOption("excluded");
  const casualty = row(page, "source-3891"),
    regen = row(page, "source-3894");
  await expect(casualty).toHaveCount(1);
  await expect(casualty.locator("td").nth(4)).toHaveText(
    "Head Injury (recorded)"
  );
  await expect(casualty.locator("td").nth(3)).toHaveText("Unknown");
  await expect(casualty.locator("td").nth(5)).toHaveText("Not scored");
  await casualty.locator("summary").click();
  await expect(casualty).toContainText(
    "Long-term league damage is not priced as current-match impact"
  );
  await expect(casualty).toContainText(
    "Final removal, recovery and useful availability require separate evidence"
  );
  await casualty
    .locator("p")
    .filter({ hasText: "The recorded casualty result" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "/tmp/nufflizier-casualty-direct-desktop.png"
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await casualty
    .locator("p")
    .filter({ hasText: "The recorded casualty result" })
    .scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "/tmp/nufflizier-casualty-direct-mobile.png" });
  await revealText(casualty.locator("td").nth(4));
  await page.getByLabel("Scoring status").selectOption("scored");
  await expect(casualty).toHaveCount(0);
  await expect(regen).toHaveCount(1);
  await expect(regen.locator("td").nth(5)).toHaveText("0.750");
  const saved = await exported(page);
  expect(
    saved.events.find(
      (e: { metadata: { sourceId: string } }) =>
        e.metadata.sourceId === "source-3891"
    )
  ).toEqual(report.events.find((e) => e.metadata.sourceId === "source-3891"));
  expect(
    saved.events.find(
      (e: { metadata: { sourceId: string } }) =>
        e.metadata.sourceId === "source-3894"
    ).weightedDelta
  ).toBe(0.75);
  expect(saved.teams).toEqual(report.teams);
  await page.getByRole("button", { name: "Reset filters" }).click();
  await page.getByRole("button", { name: "Upload Another Replay" }).click();
  await expect(page.getByLabel("Scoring status")).toHaveCount(0);
  expect(await page.locator("nextjs-portal").count()).toBe(0);
  expect(errors).toEqual([]);
});
