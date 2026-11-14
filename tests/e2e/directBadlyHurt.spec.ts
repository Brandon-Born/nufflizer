import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";

test("direct Badly Hurt is visible with unknown odds on desktop and mobile", async ({
  page
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (["warning", "error"].includes(m.type())) errors.push(m.text());
  });
  const input = readFileSync("demo-replays/demo6.bbr", "utf8");
  const report = analyzeNufflizerInput(input);
  // The existing demo6 HTTP request separately exercises the actual worker.
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
  await page.getByLabel("Player ID or initial roster name").fill("45");
  await page.getByLabel("Category", { exact: true }).selectOption("injury");
  await page.getByLabel("Scoring status").selectOption("excluded");
  const row = page
    .locator("tbody tr")
    .filter({ hasText: "Source: source-3956;" });
  await expect(row).toHaveCount(1);
  await expect(row.locator("td").nth(3)).toHaveText("Unknown");
  await expect(row.locator("td").nth(4)).toHaveText("Badly Hurt (recorded)");
  await expect(row.locator("td").nth(5)).toHaveText("Not scored");
  await expect(row.locator("td").nth(6)).toHaveText("excluded");
  await row.locator("summary").click();
  await expect(row).toContainText("odds depend on the applicable injury table");
  await expect(row).toContainText("does not establish final posture");
  await expect(row).toContainText("no luck contribution is assigned");
  await row.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/nufflizier-direct-bh-desktop.png" });
  await page.getByLabel("Scoring status").selectOption("scored");
  await expect(row).toHaveCount(0);
  await page.getByLabel("Scoring status").selectOption("excluded");
  await row.locator("summary").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await row
    .locator("p")
    .filter({ hasText: "The recorded injury result" })
    .scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "/tmp/nufflizier-direct-bh-mobile.png" });
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).click();
  const saved = JSON.parse(
    readFileSync((await (await pending).path())!, "utf8")
  );
  expect(saved.schemaVersion).toBe("2.72");
  expect(saved.modelVersion).toBe("dice-only-36");
  expect(
    saved.events.find(
      (e: { metadata: { sourceId: string } }) =>
        e.metadata.sourceId === "source-3956"
    )
  ).toEqual(report.events.find((e) => e.metadata.sourceId === "source-3956"));
  expect(saved.verdict.luckierTeam).toBe("unknown");
  expect(await page.locator("nextjs-portal").count()).toBe(0);
  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(page.getByLabel("Player ID or initial roster name")).toHaveValue(
    ""
  );
  await page.getByRole("button", { name: "Upload Another Replay" }).click();
  await expect(page.getByLabel("Scoring status")).toHaveCount(0);
  expect(errors).toEqual([]);
});
