import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 }
]) {
  test(`first-use sample with fixture report, evidence and export at ${viewport.width}px`, async ({
    page
  }) => {
    // Real sample-to-API admission is covered by the existing real BBR test.
    // Keep CPU-heavy report construction out of the quota-bounded real gate.
    const fixtureReport = analyzeNufflizerInput(
      readFileSync("demo-replays/demo1.bbr", "utf8")
    );
    await page.route("**/api/nufflizier/analyze", (route) =>
      route.fulfill({ status: 200, json: fixtureReport })
    );
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let posts = 0;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        request.url().includes("/api/nufflizier/analyze")
      )
        posts++;
    });
    await page.goto("/");
    await expect(
      page.getByRole("link", {
        name: "github.com/Brandon-Born/nufflizer",
        exact: true
      })
    ).toHaveAttribute("href", "https://github.com/Brandon-Born/nufflizer");
    await page.getByRole("link", { name: "Start Nufflizier Analysis" }).click();
    await expect(page).toHaveURL(/\/nufflizier$/);
    await expect(page).toHaveTitle("Nufflizier");
    const sample = page.getByRole("button", { name: "Use sample replay" });
    await sample.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText(/Ready: sample replay/)).toBeVisible();
    expect(posts).toBe(0);
    const pending = page.waitForResponse(
      (response) =>
        response.url().includes("/api/nufflizier/analyze") &&
        response.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
    const response = await pending;
    expect(response.status()).toBe(200);
    const report = await response.json();
    expect(report.events.length).toBeGreaterThan(0);
    await expect(
      page.getByRole("heading", { name: "Nuffle Match Report" })
    ).toBeFocused();
    const overview = page.getByRole("region", { name: "Report overview" });
    await expect(overview).toBeVisible();
    await page
      .getByRole("button", { name: "Inspect this moment" })
      .first()
      .click();
    const evidenceRows = page
      .getByRole("table")
      .filter({
        has: page.getByRole("columnheader", {
          name: "Replay segment",
          exact: true
        })
      })
      .locator("tbody tr");
    await expect(evidenceRows).toHaveCount(1);
    await page
      .getByRole("button", { name: "Show all replay evidence" })
      .click();
    await page
      .getByLabel("Category", { exact: true })
      .selectOption("ball_handling");
    await expect(evidenceRows.first()).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download JSON" }).click();
    expect(
      JSON.parse(readFileSync((await (await download).path())!, "utf8"))
    ).toEqual(report);
    await overview.scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({
      path: `/tmp/nufflizier-sample-${viewport.width}-report.png`
    });
    await page.getByRole("button", { name: "Upload Another Replay" }).click();
    await expect(
      page.getByText("No replay selected.", { exact: true })
    ).toBeVisible();
    await expect(overview).toHaveCount(0);
    await sample.click();
    await page.locator('input[name="replay"]').setInputFiles({
      name: "my-replay.bbr",
      mimeType: "application/octet-stream",
      buffer: readFileSync("demo-replays/demo1.bbr")
    });
    await expect(page.getByText(/Ready: my-replay.bbr/)).toBeVisible();
    expect(posts).toBe(1);
    await page.route("**/api/nufflizier/analyze", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.fulfill({ status: 200, json: report }).catch(() => {});
    });
    await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
    await page.getByRole("button", { name: "Cancel analysis" }).click();
    await expect(page.getByText(/Analysis cancelled/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Analyze Nuffle Luck" })
    ).toBeEnabled();
    await expect(
      page.getByRole("heading", { name: "Nuffle Match Report" })
    ).toHaveCount(0);
    await page.screenshot({
      path: `/tmp/nufflizier-sample-${viewport.width}-upload.png`
    });
    expect(errors).toEqual([]);
    expect(await page.locator("nextjs-portal").count()).toBe(0);
  });
}
