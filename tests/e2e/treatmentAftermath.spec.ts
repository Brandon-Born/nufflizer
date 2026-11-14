import { readFileSync } from "node:fs";
import { expect, test, type Locator } from "@playwright/test";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";

// Browser plugin not available; repository production Playwright workflow.
async function reveal(cell: Locator) {
  const visible = await cell.evaluate((el) => {
    el.scrollIntoView({
      block: "start",
      inline: "center",
      behavior: "instant"
    });
    const r = document.createRange();
    r.selectNodeContents(el);
    const rect = r.getBoundingClientRect(),
      clip = el.closest("table")!.parentElement!.getBoundingClientRect();
    return (
      rect.left >= Math.max(0, clip.left) - 0.5 &&
      rect.right <= Math.min(innerWidth, clip.right) + 0.5 &&
      rect.top >= 0 &&
      rect.bottom <= innerHeight
    );
  });
  expect(visible).toBe(true);
}
for (const reserve of [false, true])
  test(`real treatment ${reserve ? "reserves state" : "retained initial result"} preserves unknown odds and availability on desktop/mobile`, async ({
    page
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (["warning", "error"].includes(m.type())) errors.push(m.text());
    });
    const input = readFileSync("demo-replays/demo3.bbr", "utf8"),
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
    await page.setInputFiles('input[name="replay"]', {
      name: "source3.bbr",
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
      .fill(reserve ? "45" : "13");
    const source = reserve ? "source-2043" : "source-636",
      row = page.locator("tbody tr").filter({ hasText: `Source: ${source};` });
    await expect(row).toHaveCount(1);
    await expect(row.locator("td").nth(3)).toHaveText("No new roll");
    await expect(row.locator("td").nth(4)).toHaveText(
      reserve ? "No injury (applied)" : "Initial injury retained (recorded)"
    );
    await expect(row.locator("td").nth(5)).toHaveText("Not scored");
    await expect(row.locator("td").nth(6)).toHaveText("excluded");
    if (!reserve) {
      const original = page
        .locator("tbody tr")
        .filter({ hasText: "Source: source-628;" });
      await expect(original.locator("td").nth(3)).toHaveText("Unknown");
      await expect(original.locator("td").nth(4)).toHaveText("Unknown");
    }
    await row.locator("summary").click();
    await expect(row).toContainText(
      reserve
        ? "applied the replacement casualty: No injury"
        : "retained the recorded initial injury without a new roll"
    );
    await expect(row).toContainText(
      reserve ? "off the pitch in reserves" : "off the pitch in the injured box"
    );
    await expect(row).toContainText(
      "Off-pitch flags do not establish a legal or useful activation"
    );
    if (reserve) {
      await expect(row).toContainText(
        "snapshot omits the status flag; it stays unknown"
      );
      await expect(row).toContainText(
        "snapshot's active controller is also unknown"
      );
    } else {
      await expect(row).toContainText(
        "result name is not verified by this notification alone"
      );
      await expect(row).toContainText("Recorded SPP notification source-634");
    }
    await row
      .locator("p")
      .filter({ hasText: "The first linked replay snapshot" })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `/tmp/nufflizier-treatment-${reserve ? "reserve" : "initial"}-desktop.png`
    });
    await page.getByLabel("Scoring status").selectOption("scored");
    await expect(row).toHaveCount(0);
    await page.getByLabel("Scoring status").selectOption("excluded");
    await row.locator("summary").click();
    await page.setViewportSize({ width: 390, height: 844 });
    await row
      .locator("p")
      .filter({ hasText: "The first linked replay snapshot" })
      .scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(390);
    await page.screenshot({
      path: `/tmp/nufflizier-treatment-${reserve ? "reserve" : "initial"}-mobile.png`
    });
    await reveal(row.locator("td").nth(4));
    await page.screenshot({
      path: `/tmp/nufflizier-treatment-${reserve ? "reserve" : "initial"}-mobile-result.png`
    });
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download JSON" }).click();
    const exported = JSON.parse(
      readFileSync((await (await pending).path())!, "utf8")
    );
    expect(exported).toEqual(report);
    expect(exported.verdict.luckierTeam).toBe("unknown");
    if (!reserve) {
      await page.getByLabel("Category", { exact: true }).selectOption("all");
      await page.getByLabel("Player ID or initial roster name").fill("40");
      const spp = page
        .locator("tbody tr")
        .filter({ hasText: "Source: source-634;" });
      await expect(spp).toHaveCount(1);
      await expect(spp.locator("td").nth(3)).toHaveText("No new roll");
      await expect(spp.locator("td").nth(4)).toHaveText("Recorded +2 SPP");
      await expect(spp.locator("td").nth(5)).toHaveText("Not scored");
    }
    await page.getByRole("button", { name: "Reset filters" }).click();
    await expect(
      page.getByLabel("Player ID or initial roster name")
    ).toHaveValue("");
    await page.getByRole("button", { name: "Upload Another Replay" }).click();
    await expect(page.getByLabel("Scoring status")).toHaveCount(0);
    expect(await page.locator("nextjs-portal").count()).toBe(0);
    expect(errors).toEqual([]);
  });
