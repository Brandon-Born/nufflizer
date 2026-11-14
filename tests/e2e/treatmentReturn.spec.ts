import { readFileSync } from "node:fs";
import { expect, test, type Locator } from "@playwright/test";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";

// Browser plugin absent; use the repository production Playwright workflow.
async function reveal(cell: Locator) {
  expect(
    await cell.evaluate((el) => {
      el.scrollIntoView({
        block: "start",
        inline: "center",
        behavior: "instant"
      });
      const range = document.createRange();
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect(),
        clip = el.closest("table")!.parentElement!.getBoundingClientRect();
      return (
        r.left >= Math.max(0, clip.left) - 0.5 &&
        r.right <= Math.min(innerWidth, clip.right) + 0.5 &&
        r.top >= 0 &&
        r.bottom <= innerHeight
      );
    })
  ).toBe(true);
}
for (const partial of [false, true])
  test(`treatment reserves ${partial ? "partial return" : "later Move and staff gap"} keeps observed participation separate from value`, async ({
    page
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (["warning", "error"].includes(m.type())) errors.push(m.text());
    });
    const input = readFileSync(
        `demo-replays/${partial ? "demo1" : "demo3"}.bbr`,
        "utf8"
      ),
      report = analyzeNufflizerInput(input);
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
    await page.getByLabel("Category", { exact: true }).selectOption("injury");
    await page.getByLabel("Scoring status").selectOption("excluded");
    await page
      .getByLabel("Player ID or initial roster name")
      .fill(partial ? "37" : "7");
    const source = partial ? "source-5188" : "source-3060",
      row = page.locator("tbody tr").filter({ hasText: `Source: ${source};` });
    await expect(row).toHaveCount(1);
    await row.locator("summary").click();
    await expect(row).toContainText(
      partial
        ? "setup (source 5302), then in regular play (source 5366)"
        : "setup (source 3809), then in regular play (source 3876)"
    );
    await expect(row).toContainText(
      "Setup CanAct flags are not legal-activation evidence"
    );
    await expect(row).toContainText(
      "No extra luck or contextual value is added"
    );
    if (partial) {
      await expect(row).toContainText(
        "the first later declaration is not qualified"
      );
      await expect(row).toContainText(
        "No later activation is linked under this policy"
      );
    } else
      await expect(row).toContainText(
        "A Move declaration is recorded at source-4175"
      );
    const explanation = row
      .locator("p")
      .filter({ hasText: /is later observed back on the pitch/ });
    await explanation.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `/tmp/nufflizier-treatment-return-${partial ? "partial" : "move"}-desktop.png`
    });
    await page.getByLabel("Scoring status").selectOption("scored");
    await expect(row).toHaveCount(0);
    await page.getByLabel("Scoring status").selectOption("excluded");
    await row.locator("summary").click();
    await page.setViewportSize({ width: 390, height: 844 });
    await explanation.scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(390);
    await page.screenshot({
      path: `/tmp/nufflizier-treatment-return-${partial ? "partial" : "move"}-mobile.png`
    });
    if (!partial) {
      await page.getByLabel("Player ID or initial roster name").fill("45");
      const gap = page
        .locator("tbody tr")
        .filter({ hasText: "Source: source-2043;" });
      await gap.locator("summary").click();
      await expect(gap).toContainText(
        "A later return cannot be linked to this treatment"
      );
      await expect(gap).toContainText(
        "roster-instance continuity is unverified"
      );
      await expect(gap).toContainText(
        "A later convenient snapshot cannot repair that gap"
      );
      await page.getByLabel("Player ID or initial roster name").fill("7");
      await page.getByLabel("Category", { exact: true }).selectOption("all");
      const marker = page
        .locator("tbody tr")
        .filter({ hasText: "Source: source-4175;" });
      for (
        let pageIndex = 0;
        (await marker.count()) === 0 && pageIndex < 10;
        pageIndex++
      ) {
        const next = page.getByRole("button", { name: "Next page" });
        await expect(next).toBeEnabled();
        await next.click();
      }
      await expect(marker).toHaveCount(1);
      await marker.locator("summary").click();
      await expect(marker).toContainText(
        "This treated player's Move declaration is linked to treatment source-3060"
      );
      await expect(marker.locator("td").nth(3)).toHaveText("No new roll");
      await expect(marker.locator("td").nth(4)).toHaveText(
        "Recorded Move declaration"
      );
      await expect(marker.locator("td").nth(5)).toHaveText("Not scored");
      await reveal(marker.locator("td").nth(4));
      await page.screenshot({
        path: "/tmp/nufflizier-treatment-return-move-mobile-marker.png"
      });
    }
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download JSON" }).click();
    const saved = JSON.parse(
      readFileSync((await (await pending).path())!, "utf8")
    );
    expect(saved).toEqual(report);
    expect(saved.schemaVersion).toBe("2.70");
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
