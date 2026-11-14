import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";

for (const c of [
  {
    file: "demo6",
    source: "source-188",
    value: -13 / 24,
    text: "defender Right Stuff, Stunty",
    screenshot: "negative"
  },
  {
    file: "demo1",
    source: "source-272",
    value: 0,
    text: "attacker Animosity (Underworld Goblin Linemen)",
    screenshot: "zero"
  }
])
  test(`documented block skills: ${c.screenshot} value is distinct from missing evidence`, async ({
    page
  }) => {
    const input = readFileSync(`demo-replays/${c.file}.bbr`, "utf8"),
      report = analyzeNufflizerInput(input);
    const e = report.events.find((e) => e.metadata.sourceId === c.source)!;
    const unknown = report.events.find(
      (e) => e.metadata.block && e.scoringStatus === "excluded"
    )!;
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
    await expect(page).toHaveURL(/\/nufflizier$/);
    await expect(page).toHaveTitle("Nufflizier");
    await expect(
      page.getByRole("heading", { name: "Blessed by Nuffle Analyzer" })
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
    await page.getByLabel("Category", { exact: true }).selectOption("block");
    await page.getByLabel("Player ID or initial roster name").fill(e.playerId!);
    await page.getByLabel("Scoring status").selectOption("scored");
    const row = page
      .locator("tbody tr")
      .filter({ hasText: `Source: ${c.source};` });
    await expect(row).toHaveCount(1);
    await expect(row.locator("td").nth(3)).toHaveText("Categorical");
    await expect(row.locator("td").nth(5)).toHaveText(c.value.toFixed(3));
    await row.locator("summary").click();
    await expect(row).toContainText(c.text);
    await expect(row).toContainText(
      "without changing this pool's immediate knockdown table"
    );
    await expect(row).toContainText(
      "Those other effects are outside this component"
    );
    await expect(row).toContainText(
      "not the coach's actual choice or tactical impact"
    );
    await row.scrollIntoViewIfNeeded();
    if (c.screenshot === "negative")
      await page.screenshot({
        path: "/tmp/nufflizier-block-skills-desktop.png"
      });
    await page.setViewportSize({ width: 390, height: 844 });
    await row
      .locator("p")
      .filter({ hasText: "Current skills classified separately" })
      .first()
      .scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(390);
    if (c.screenshot === "zero")
      await page.screenshot({
        path: "/tmp/nufflizier-block-skills-mobile.png"
      });
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download JSON" }).click();
    const saved = JSON.parse(
      readFileSync((await (await pending).path())!, "utf8")
    );
    const exported = saved.events.find((v: { id: string }) => v.id === e.id);
    expect(exported).toEqual(e);
    expect(saved.schemaVersion).toBe("2.64");
    expect(saved.modelVersion).toBe("dice-only-33");
    expect(saved.verdict.luckierTeam).toBe("unknown");
    await page
      .getByLabel("Player ID or initial roster name")
      .fill(unknown.playerId!);
    await page.getByLabel("Scoring status").selectOption("excluded");
    const withheld = page
      .locator("tbody tr")
      .filter({ hasText: `Source: ${unknown.metadata.sourceId};` });
    await expect(withheld).toHaveCount(1);
    await expect(withheld.locator("td").nth(5)).toHaveText("Not scored");
    await withheld.locator("summary").click();
    await expect(withheld).toContainText("without a block luck point");
    await page.getByRole("button", { name: "Reset filters" }).click();
    await expect(
      page.getByLabel("Player ID or initial roster name")
    ).toHaveValue("");
    await page.getByRole("button", { name: "Upload Another Replay" }).click();
    await expect(page.getByLabel("Scoring status")).toHaveCount(0);
    expect(await page.locator("nextjs-portal").count()).toBe(0);
    expect(errors).toEqual([]);
  });
