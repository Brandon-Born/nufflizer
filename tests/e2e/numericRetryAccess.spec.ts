import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";

for (const c of [
  {
    file: "demo9",
    actor: "10",
    gate: "source-3159",
    first: "source-3154",
    label: "Loner",
    g: 1 / 2,
    pct: "50.0%",
    contribution: "-0.367",
    delta: "-0.333",
    spent: 1
  },
  {
    file: "demo11",
    actor: "38",
    gate: "source-4550",
    first: "source-4546",
    label: "Pro",
    g: 2 / 3,
    pct: "66.7%",
    contribution: "-0.489",
    delta: "-0.444",
    spent: 0
  }
])
  test(`${c.label} gate shows its own probability and a separate rescue-chance contribution`, async ({
    page
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (["error", "warning"].includes(m.type())) errors.push(m.text());
    });
    const input = readFileSync(`demo-replays/${c.file}.bbr`, "utf8"),
      report = analyzeNufflizerInput(input);
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
    await page.getByLabel("Scoring status").selectOption("scored");
    const row = page
      .locator("tbody tr")
      .filter({ hasText: `Source: ${c.gate};` });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(
      `${c.label} ${c.label === "Loner" ? "4+" : "3+"} retry access failed`
    );
    await expect(row.locator("td").nth(3)).toHaveText(c.pct);
    await expect(row.locator("td").nth(4)).toHaveText("Fail");
    await expect(row.locator("td").nth(5)).toHaveText(c.contribution);
    await row.locator("summary").click();
    await expect(row).toContainText("did not grant access to one Dodge retry");
    await expect(row).toContainText(
      "if the retried Dodge keeps the same fixed conditions"
    );
    await expect(row).toContainText("die 2 | target");
    await expect(row).not.toContainText("0.666666666666");
    await expect(row).toContainText(
      `chance of rescuing the failed Dodge by ${c.delta}`
    );
    await expect(row).toContainText(
      `original die (${c.first}) keeps its separate contribution`
    );
    await expect(row).toContainText("tactical resource cost add no dice score");
    await expect(row).not.toContainText("gate itself is unscored");
    await row.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `/tmp/nufflizier-retry-access-${c.label.toLowerCase()}-desktop.png`
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await row
      .locator("p")
      .filter({ hasText: "did not grant access to one Dodge retry" })
      .scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(390);
    await page.screenshot({
      path: `/tmp/nufflizier-retry-access-${c.label.toLowerCase()}-mobile.png`
    });
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download JSON" }).click();
    const saved = JSON.parse(
      readFileSync((await (await pending).path())!, "utf8")
    );
    expect(saved.schemaVersion).toBe("2.65");
    expect(saved.modelVersion).toBe("dice-only-34");
    expect(saved.contextModelVersion).toBe("mobility-possession-42");
    const gate = saved.events.find(
        (e: { metadata: { sourceId: string } }) =>
          e.metadata.sourceId === c.gate
      ),
      first = saved.events.find(
        (e: { metadata: { sourceId: string } }) =>
          e.metadata.sourceId === c.first
      );
    expect(gate.metadata.numericRetryAccess.originalSourceId).toBe(c.first);
    expect(gate.probabilitySuccess).toBeCloseTo(c.g, 12);
    expect(gate.delta).toBeCloseTo(-(2 / 3) * c.g, 12);
    expect(gate.metadata.teamRerollsSpent).toBe(c.spent);
    expect(first.metadata.numericOriginal).toBeDefined();
    expect(first.delta).toBeCloseTo(-2 / 3, 12);
    expect(
      saved.diceRecords.find(
        (d: { parentSourceId: string; path: string[] }) =>
          d.parentSourceId === c.gate && d.path.join(".") === "Dice"
      ).disposition
    ).toBe("covered_roll");
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
