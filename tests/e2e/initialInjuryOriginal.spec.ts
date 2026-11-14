import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { staffInjuryXml, koInjuryXml } from "../helpers/staffInjuryOriginal";

// Browser plugin not available; repository production Playwright workflow.
for (const ko of [false, true])
  test(`initial ${ko ? "KO" : "Stunty Badly Hurt"} original has a conditional contribution on desktop and mobile`, async ({
    page
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (["warning", "error"].includes(m.type())) errors.push(m.text());
    });
    const input = ko
        ? koInjuryXml({ dice: [4, 4], outcome: 2 })
        : staffInjuryXml({ skills: [59], dice: [3, 6], outcome: 3 }),
      report = analyzeNufflizerInput(input),
      e = report.events.find((e) => e.metadata.injuryScoring)!;
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
      name: "synthetic-complete-profile.xml",
      mimeType: "application/xml",
      buffer: Buffer.from(input)
    });
    await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
    await expect(
      page.getByRole("heading", { name: "Nuffle Match Report" })
    ).toBeVisible();
    await page.getByLabel("Category", { exact: true }).selectOption("injury");
    await page.getByLabel("Scoring status").selectOption("scored");
    const row = page
      .locator("tbody tr")
      .filter({ hasText: `Source: ${e.metadata.sourceId};` });
    await expect(row).toHaveCount(1);
    await expect(row.locator("td").nth(3)).toHaveText("Categorical");
    await expect(row.locator("td").nth(4)).toHaveText(
      ko ? "KO (recorded)" : "Badly Hurt (initial)"
    );
    await expect(row.locator("td").nth(5)).toHaveText(ko ? "-0.625" : "-1.083");
    await row.locator("summary").click();
    await expect(row).toContainText(
      ko ? "stored in a recovery question" : "verified current Stunty profile"
    );
    await expect(row).toContainText("36 fair 2D6");
    await expect(row).toContainText(
      "Treatment, recovery and match impact remain separate"
    );
    await row.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `/tmp/nufflizier-initial-${ko ? "ko" : "bh"}-desktop.png`
    });
    await page.getByLabel("Scoring status").selectOption("excluded");
    await expect(row).toHaveCount(0);
    await page.getByLabel("Scoring status").selectOption("scored");
    await row.locator("summary").click();
    await page.setViewportSize({ width: 390, height: 844 });
    await row
      .locator("p")
      .filter({
        hasText: ko
          ? "stored in a recovery question"
          : "verified current Stunty profile"
      })
      .scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(390);
    await page.screenshot({
      path: `/tmp/nufflizier-initial-${ko ? "ko" : "bh"}-mobile.png`
    });
    const visibleContribution = await row
      .locator("td")
      .nth(5)
      .evaluate((el) => {
        el.scrollIntoView({
          block: "start",
          inline: "center",
          behavior: "instant"
        });
        const range = document.createRange();
        range.selectNodeContents(el);
        const rect = range.getBoundingClientRect(),
          clip = el.closest("table")!.parentElement!.getBoundingClientRect();
        return (
          rect.left >= Math.max(0, clip.left) - 0.5 &&
          rect.right <= Math.min(innerWidth, clip.right) + 0.5 &&
          rect.top >= 0 &&
          rect.bottom <= innerHeight
        );
      });
    expect(visibleContribution).toBe(true);
    await page.screenshot({
      path: `/tmp/nufflizier-initial-${ko ? "ko" : "bh"}-mobile-score.png`
    });
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download JSON" }).click();
    const saved = JSON.parse(
      readFileSync((await (await pending).path())!, "utf8")
    );
    expect(saved).toEqual(report);
    expect(saved.events.find((x: { id: string }) => x.id === e.id)).toEqual(e);
    await page.getByRole("button", { name: "Reset filters" }).click();
    await expect(page.getByLabel("Category", { exact: true })).toHaveValue(
      "all"
    );
    await page.getByRole("button", { name: "Upload Another Replay" }).click();
    await expect(page.getByLabel("Scoring status")).toHaveCount(0);
    expect(await page.locator("nextjs-portal").count()).toBe(0);
    expect(errors).toEqual([]);
  });
