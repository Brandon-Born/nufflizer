import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { scoringRushXml } from "../helpers/scoringRush";

for (const c of [
  { label: "late failure", options: {}, value: -10, pressure: "8.000" },
  {
    label: "early failure",
    options: { early: true },
    value: -85 / 24,
    pressure: "0.250"
  },
  {
    label: "late success",
    options: { face: 6, aftermath: true },
    value: 2,
    pressure: "8.000"
  },
  {
    label: "unresolved retry",
    options: { teamRerolls: 1 },
    value: null,
    pressure: null
  }
])
  test(`scoring Rush ${c.label} keeps partial context, dice and exported successors distinct`, async ({
    page
  }) => {
    const input = scoringRushXml(c.options),
      report = analyzeNufflizerInput(input);
    const e = report.events.find((e) => e.metadata.rollType === 1)!;
    // The actual HTTP and CLI workers have separate acceptance tests. These
    // synthetic fixtures exercise the validated report's rendered interpretation.
    await page.route("**/api/nufflizier/analyze", (r) =>
      r.fulfill({
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
    await expect(
      page.getByRole("heading", { name: "Blessed by Nuffle Analyzer", exact: true })
    ).toBeVisible();
    await page.setInputFiles('input[name="replay"]', {
      name: "synthetic.xml",
      mimeType: "application/xml",
      buffer: Buffer.from(input)
    });
    await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
    await expect(
      page.getByRole("heading", { name: "Nuffle Match Report" })
    ).toBeVisible();
    await page
      .getByLabel("Category", { exact: true })
      .selectOption("movement_risk");
    await page.getByLabel("Scoring status").selectOption("scored");
    await page.getByLabel("Sort order").selectOption("context");
    const row = page
      .locator("tbody tr")
      .filter({ hasText: `Source: ${e.metadata.sourceId};` });
    await expect(row).toHaveCount(1);
    await expect(row.locator("td").nth(3)).toHaveText("83.3%");
    await row.locator("summary").click();
    if (c.value !== null) {
      await expect(row).toContainText(
        `4 touchdown units plus ${c.pressure} score-pressure units`
      );
      await expect(row).toContainText("armor and ball movement still pending");
      await expect(row).toContainText(
        "heuristic, not a win probability or final-match prediction"
      );
      await expect(row).toContainText(
        `${c.value.toFixed(3)} provisional context units`
      );
      await expect(row).toContainText(
        "no applicable skill retry or extra Dodge check"
      );
    } else {
      await expect(row).not.toContainText("touchdown units plus");
      expect(e.contextualImpact).toBeUndefined();
    }
    await row.scrollIntoViewIfNeeded();
    if (c.label === "late failure")
      await page.screenshot({
        path: "/tmp/nufflizier-scoring-rush-desktop.png"
      });
    await page.setViewportSize({ width: 390, height: 844 });
    if (c.value !== null)
      await row.getByText(/A successful Rush carries/).scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(390);
    if (c.label === "late failure")
      await page.screenshot({
        path: "/tmp/nufflizier-scoring-rush-mobile.png"
      });
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download JSON" }).click();
    const saved = JSON.parse(
      readFileSync((await (await pending).path())!, "utf8")
    );
    const exported = saved.events.find((v: { id: string }) => v.id === e.id);
    expect(exported.contextualImpact).toEqual(e.contextualImpact);
    expect(saved.teams).toEqual(report.teams);
    expect(saved.verdict.luckierTeam).toBe("unknown");
    if (c.value !== null)
      expect(saved.teams[0].impactByType.movement_risk).toBeCloseTo(
        c.value,
        12
      );
    await page.getByRole("button", { name: "Reset filters" }).click();
    await expect(page.getByLabel("Sort order")).toHaveValue("chronological");
    await page.getByRole("button", { name: "Upload Another Replay" }).click();
    await expect(page.getByLabel("Scoring status")).toHaveCount(0);
    expect(await page.locator("nextjs-portal").count()).toBe(0);
    expect(errors).toEqual([]);
  });
