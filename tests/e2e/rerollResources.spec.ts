import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";

for (const c of [
  {
    file: "demo6",
    count: 12,
    unresolved: 0,
    source: "source-971",
    line: "The controller remains unknown"
  },
  {
    file: "demo7",
    count: 15,
    unresolved: 0,
    source: "source-5448",
    line: "The controller remains unknown"
  },
  {
    file: "demo1",
    count: 21,
    unresolved: 1,
    source: "source-5407",
    line: "Its offer/owner continuation is unresolved"
  },
  {
    file: "demo11",
    count: 15,
    unresolved: 0,
    source: "source-4548",
    line: "team reroll unavailable, Pro available"
  }
])
  test(`${c.file} exposes all recorded resource choices without adding dice scores`, async ({
    page
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (["error", "warning"].includes(m.type())) errors.push(m.text());
    });
    const input = readFileSync(`demo-replays/${c.file}.bbr`, "utf8"),
      report = analyzeNufflizerInput(input);
    expect(report.rerollResources.decisionCount).toBe(c.count);
    expect(report.rerollResources.unresolvedCount).toBe(c.unresolved);
    await page.route("**/api/nufflizier/analyze", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(report)
      })
    );
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/nufflizier");
    await expect(page).toHaveTitle("Nufflizier");
    await expect(page).toHaveURL(/\/nufflizier$/);
    await page.setInputFiles('input[name="replay"]', {
      name: "resource-source.bbr",
      mimeType: "application/octet-stream",
      buffer: Buffer.from(input)
    });
    await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
    await expect(
      page.getByRole("heading", { name: "Nuffle Match Report" })
    ).toBeVisible();
    await expect(
      page.getByText(`Team reroll record: ${c.count} choices`, { exact: false })
    ).toContainText(`${c.unresolved} unresolved`);
    await page
      .getByLabel("Player ID or initial roster name")
      .fill("missing player");
    const view = page.getByRole("button", {
      name: `View team reroll choices (${c.count})`
    });
    await view.click();
    await expect(view).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByLabel("Player ID or initial roster name")
    ).toHaveValue("");
    await expect(
      page.getByText(`${c.count} matching events; page 1 of 1`, { exact: true })
    ).toBeVisible();
    const row = page
      .locator("tbody tr")
      .filter({ hasText: `Source ${c.source};` });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(
      c.file === "demo11"
        ? "Recorded team reroll not used"
        : c.file === "demo6"
          ? "Recorded team reroll spend"
          : "Recorded team reroll use"
    );
    await row.locator("summary").click();
    await expect(row).toContainText(c.line);
    await expect(row).toContainText(
      "This decision adds no random outcome or luck score"
    );
    await expect(row.locator("td").nth(3)).toHaveText("Unknown");
    await expect(row.locator("td").nth(5)).toHaveText("Not scored");
    await row.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `/tmp/nufflizier-resources-${c.file}-desktop.png`
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await row.locator("p").filter({ hasText: c.line }).scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(390);
    await page.screenshot({
      path: `/tmp/nufflizier-resources-${c.file}-mobile.png`
    });
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download JSON" }).click();
    const saved = JSON.parse(
      readFileSync((await (await pending).path())!, "utf8")
    );
    expect(saved.schemaVersion).toBe("2.62");
    expect(saved.rerollResources).toEqual(report.rerollResources);
    expect(saved.verdict.luckierTeam).toBe("unknown");
    await page.getByRole("button", { name: "Reset filters" }).click();
    await expect(view).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByLabel("Scoring status")).toHaveValue("scored");
    await page.getByRole("button", { name: "Upload Another Replay" }).click();
    await expect(
      page.getByRole("heading", { name: "Nuffle Match Report" })
    ).toHaveCount(0);
    expect(errors).toEqual([]);
  });
