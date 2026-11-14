import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
// Browser plugin not available; repository production Playwright workflow.
for (const file of ["demo1", "demo6"])
  test(`${file} exposes typed Throw Team-mate participants without odds or new value`, async ({
    page
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (["error", "warning"].includes(m.type())) errors.push(m.text());
    });
    const input = readFileSync(`demo-replays/${file}.bbr`),
      report = analyzeNufflizerInput(input.toString("utf8"));
    await page.route("**/api/nufflizier/analyze", (r) =>
      r.fulfill({
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
      name: "source.bbr",
      mimeType: "application/octet-stream",
      buffer: input
    });
    await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
    await expect(
      page.getByRole("heading", { name: "Nuffle Match Report" })
    ).toBeVisible();
    await page.getByLabel("Scoring status").selectOption("excluded");
    await page.getByLabel("Player ID or initial roster name").fill("37");
    const id = file === "demo1" ? "source-5406" : "source-2273",
      row = page.locator("tbody tr").filter({ hasText: `Source: ${id};` });
    for (let i = 0; (await row.count()) === 0 && i < 20; i++)
      await page.getByRole("button", { name: "Next page" }).click();
    await expect(row).toHaveCount(1);
    await row.locator("summary").click();
    await expect(row).toContainText(
      `player 37 as the thrower and player ${file === "demo1" ? 50 : 45} as the thrown player`
    );
    await expect(row).toContainText(
      "A Pass-budget declaration and any later landing are separate records"
    );
    await expect(row).toContainText(
      "These roles do not establish legal eligibility, current skills or dice odds"
    );
    await expect(row.locator("td").nth(3)).toHaveText("No new roll");
    await expect(row.locator("td").nth(4)).toHaveText("Recorded participants");
    await expect(row.locator("td").nth(5)).toHaveText("Not scored");
    const why = row
      .locator("p")
      .filter({ hasText: "The recorded Throw Team-mate step identifies" });
    await why.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/tmp/nufflizier-ttm-${file}-desktop.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await why.scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(390);
    await page.screenshot({ path: `/tmp/nufflizier-ttm-${file}-mobile.png` });
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download JSON" }).click();
    const saved = JSON.parse(
      readFileSync((await (await pending).path())!, "utf8")
    );
    expect(saved).toEqual(report);
    await page.getByRole("button", { name: "Reset filters" }).click();
    await expect(page.getByLabel("Scoring status")).toHaveValue("scored");
    await expect(row).toHaveCount(0);
    await page.getByRole("button", { name: "Upload Another Replay" }).click();
    await expect(
      page.getByRole("button", { name: "Analyze Nuffle Luck" })
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
