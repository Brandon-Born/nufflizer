import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";

for (const c of [
  {
    file: "demo9",
    actor: "10",
    kept: "source-3160",
    name: "Loner",
    kind: "loner",
    odds: "77.8%",
    fraction: 7 / 9,
    spent: 1
  },
  {
    file: "demo11",
    actor: "38",
    kept: "source-4551",
    name: "Pro",
    kind: "pro",
    odds: "81.5%",
    fraction: 22 / 27,
    spent: 0
  }
])
  test(`${c.name} failed-gate policy remains separate from applied dice odds`, async ({
    page
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (["error", "warning"].includes(m.type())) errors.push(m.text());
    });
    const input = readFileSync(`demo-replays/${c.file}.bbr`, "utf8");
    const report = analyzeNufflizerInput(input);
    // Heavy real-worker HTTP admission is checked separately. This isolates
    // browser rendering/export against the actual complete domain report.
    await page.route("**/api/nufflizier/analyze", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(report)
      })
    );
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/nufflizier");
    await expect(page).toHaveURL(/\/nufflizier$/);
    await expect(page).toHaveTitle("Nufflizier");
    await page.setInputFiles('input[name="replay"]', {
      name: "source.bbr",
      mimeType: "application/octet-stream",
      buffer: Buffer.from(input)
    });
    await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
    await expect(
      page.getByRole("heading", { name: "Nuffle Match Report" })
    ).toBeVisible();
    await page.getByLabel("Player ID or initial roster name").fill(c.actor);
    await page.getByLabel("Category", { exact: true }).selectOption("dodge");
    await page.getByLabel("Scoring status").selectOption("excluded");
    const row = page
      .locator("tbody tr")
      .filter({ hasText: `Source: ${c.kept};` });
    await expect(row).toHaveCount(1);
    await expect(row.locator("td").nth(3)).toHaveText("Unknown");
    await row.locator("summary").click();
    await expect(row).toContainText(
      `${c.name} failed, so the recorded original Dodge was kept`
    );
    await expect(row).toContainText("No fresh Dodge die was rolled");
    if (c.kind === "pro") {
      await expect(row).toContainText("Recorded team reroll not used");
      await expect(row).not.toContainText("declined");
    }
    await expect(row).toContainText(c.odds);
    await expect(row).toContainText(
      c.spent ? "One team reroll was spent" : "no team reroll was spent"
    );
    await expect(row).toContainText("conditional policy odds add no score");
    await expect(row).toContainText(
      "tactical resource cost remain unquantified"
    );
    await row.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `/tmp/nufflizier-failed-retry-${c.kind}-desktop.png`
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await row
      .locator("p")
      .filter({
        hasText: `${c.name} failed, so the recorded original Dodge was kept`
      })
      .scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(390);
    await page.screenshot({
      path: `/tmp/nufflizier-failed-retry-${c.kind}-mobile.png`
    });
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download JSON" }).click();
    const saved = JSON.parse(
      readFileSync((await (await download).path())!, "utf8")
    );
    expect(saved.schemaVersion).toBe("2.63");
    expect(saved.modelVersion).toBe("dice-only-32");
    const kept = saved.events.find(
      (e: { metadata: { sourceId: string } }) => e.metadata.sourceId === c.kept
    );
    expect(kept.metadata.failedNumericRetry.kind).toBe(c.kind);
    expect(
      kept.metadata.failedNumericRetry.fixedPolicySuccessChance
    ).toBeCloseTo(c.fraction, 12);
    expect(kept.metadata.teamRerollsSpent).toBeUndefined();
    expect(kept.metadata.rerollUsed).toBeUndefined();
    const gate = saved.events.find(
      (e: { metadata: { sourceId: string } }) =>
        e.metadata.sourceId === kept.metadata.failedNumericRetry.gateSourceId
    );
    expect(gate.metadata.teamRerollsSpent).toBe(c.spent);
    expect(kept.probabilitySuccess).toBeNull();
    expect(kept.weightedDelta).toBe(0);
    expect(saved.verdict.luckierTeam).toBe("unknown");
    expect(
      saved.teams.every((t: { impactCount: number }) => t.impactCount === 0)
    ).toBe(true);
    expect(await page.locator("nextjs-portal").count()).toBe(0);
    await page.getByRole("button", { name: "Reset filters" }).click();
    await expect(
      page.getByLabel("Player ID or initial roster name")
    ).toHaveValue("");
    await page.getByRole("button", { name: "Upload Another Replay" }).click();
    await expect(page.getByLabel("Scoring status")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
