import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";

// Browser plugin unavailable; the repository production Playwright workflow
// checks these report views after all unmocked-worker browser cases finish.
for (const c of [
  {
    file: "demo9.bbr",
    source: "source-797",
    player: "39",
    category: "block",
    weighted: 5 / 24,
    explanation: "Intrinsic skill evidence",
    actual: "Offered balance +1"
  },
  {
    file: "demo10.bbr",
    source: "source-1121",
    player: "48",
    category: "injury",
    weighted: -13 / 12,
    explanation: "The recorded injury result",
    actual: "Badly Hurt (recorded)"
  }
])
  test(`continued intrinsic traits qualify ${c.file}/${c.source} without invented context`, async ({
    page
  }) => {
    const input = readFileSync("demo-replays/" + c.file, "utf8"),
      report = analyzeNufflizerInput(input),
      errors: string[] = [];
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
    await expect(
      page.getByRole("button", { name: "Analyze Nuffle Luck" })
    ).toBeVisible();
    await page.setInputFiles('input[name="replay"]', {
      name: "source.bbr",
      mimeType: "application/octet-stream",
      buffer: Buffer.from(input)
    });
    await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
    await expect(
      page.getByRole("heading", { name: "Nuffle Match Report" })
    ).toBeVisible();
    await page.getByLabel("Category", { exact: true }).selectOption(c.category);
    await page.getByLabel("Scoring status").selectOption("scored");
    await page.getByLabel("Player ID or initial roster name").fill(c.player);
    const row = page
      .locator("tbody tr")
      .filter({ hasText: `Source: ${c.source};` });
    for (let n = 0; (await row.count()) === 0 && n < 20; n++) {
      await expect(
        page.getByRole("button", { name: "Next page" })
      ).toBeEnabled();
      await page.getByRole("button", { name: "Next page" }).click();
    }
    await expect(row).toHaveCount(1);
    await row.locator("summary").click();
    await expect(row.locator("td").nth(3)).toHaveText("Categorical");
    await expect(row.locator("td").nth(4)).toHaveText(c.actual);
    if (c.category === "block") {
      await expect(row).toContainText("expected balance is 0.722");
      await expect(row).toContainText(
        "checkpoints 0/12 through current roster checkpoint 787"
      );
      await expect(row).toContainText(
        "not the coach's actual choice or tactical impact"
      );
    } else {
      await expect(row).toContainText("Stunty");
      await expect(row).toContainText("failed movement check");
      await expect(row).toContainText(
        "Positive favors the injured player's team"
      );
      await expect(row).toContainText(
        "Treatment, recovery and match impact remain separate"
      );
    }
    const why = row.locator("p").filter({ hasText: c.explanation });
    await why.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `/tmp/nufflizier-intrinsic-${c.category}-desktop.png`
    });
    await page.getByLabel("Scoring status").selectOption("excluded");
    await expect(row).toHaveCount(0);
    await page.getByLabel("Scoring status").selectOption("scored");
    for (let n = 0; (await row.count()) === 0 && n < 20; n++)
      await page.getByRole("button", { name: "Next page" }).click();
    await row.locator("summary").click();
    await page.setViewportSize({ width: 390, height: 844 });
    await why.scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(390);
    await page.screenshot({
      path: `/tmp/nufflizier-intrinsic-${c.category}-mobile.png`
    });
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download JSON" }).click();
    const saved = JSON.parse(
      readFileSync((await (await pending).path())!, "utf8")
    );
    expect(saved).toEqual(report);
    expect(saved.schemaVersion).toBe("2.72");
    expect(saved.modelVersion).toBe("dice-only-36");
    expect(
      saved.events.find(
        (e: { metadata: { sourceId: string } }) =>
          e.metadata.sourceId === c.source
      ).weightedDelta
    ).toBeCloseTo(c.weighted, 12);
    expect(saved.verdict.luckierTeam).toBe("unknown");
    expect(
      saved.teams.every((t: { impactCount: number }) => t.impactCount === 0)
    ).toBe(true);
    await page.getByRole("button", { name: "Reset filters" }).click();
    await expect(
      page.getByLabel("Player ID or initial roster name")
    ).toHaveValue("");
    await page.getByRole("button", { name: "Upload Another Replay" }).click();
    await expect(page.getByLabel("Scoring status")).toHaveCount(0);
    expect(await page.locator("nextjs-portal").count()).toBe(0);
    expect(errors).toEqual([]);
  });
