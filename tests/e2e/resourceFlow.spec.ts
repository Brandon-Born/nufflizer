import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";

for (const c of [
  { file: "demo1", step: 134, before: 4, after: 2 },
  { file: "demo3", step: 294, before: 1, after: 3 },
  { file: "demo11", step: 454, before: 2, after: null }
])
  test(`${c.file} exposes counter windows, raw unknowns and isolated timeline choices`, async ({
    page
  }) => {
    const input = readFileSync(`demo-replays/${c.file}.bbr`, "utf8"),
      report = analyzeNufflizerInput(input),
      events = new Map(report.events.map((e) => [e.id, e]));
    const ordinal = report.rerollResources.decisions.findIndex(
        (d) =>
          events.get(d.decisionEventId)?.metadata.locator?.replayStep === c.step
      ),
      flow = report.rerollResources.flow,
      w = flow.clockWindows.find((w) => w.decisionOrdinals.includes(ordinal))!;
    expect(w.before?.count).toBe(c.before);
    expect(w.after?.count).toBe(c.after);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (["error", "warning"].includes(m.type())) errors.push(m.text());
    });
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
      buffer: Buffer.from(input)
    });
    await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
    const panel = page.getByRole("region", { name: "Recorded counter flow" });
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(
      `${flow.clockSnapshots.length} source checkpoints`
    );
    await panel
      .getByText("Inspect counter windows and source checkpoints", {
        exact: true
      })
      .click();
    const pages = panel.getByRole("navigation", {
      name: "Counter window pages"
    });
    for (let n = 0; n < Math.floor(w.id / 10); n++)
      await pages.getByRole("button", { name: "Next", exact: true }).click();
    await panel
      .getByRole("button", { name: `Inspect window ${w.id + 1}`, exact: true })
      .click();
    const detail = panel.getByLabel("Selected counter window");
    await expect(detail).toContainText(
      `${c.before} → ${c.after === null ? "unknown" : c.after}`
    );
    await detail.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `/tmp/nufflizier-flow-${c.file}-window-desktop.png`
    });
    await panel
      .getByRole("button", {
        name: `Show starting checkpoint for window ${w.id + 1}`,
        exact: true
      })
      .click();
    await panel
      .getByText(
        `Browse all source counter checkpoints (${flow.clockSnapshots.length})`,
        { exact: true }
      )
      .click();
    const sourceTable = panel.getByRole("table");
    await expect(sourceTable.locator("tbody tr")).toHaveCount(10);
    await expect(sourceTable).toContainText(
      `ReplayStep ${flow.clockSnapshots[w.startSnapshotId!]!.source.replayStep}`
    );
    await sourceTable.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `/tmp/nufflizier-flow-${c.file}-desktop.png`
    });
    await page.setViewportSize({ width: 390, height: 844 });
    if (c.after === null) {
      const pages = panel.getByRole("navigation", {
        name: "Counter checkpoint pages"
      });
      for (
        let n = Math.floor(w.startSnapshotId! / 10);
        n < Math.floor(w.endSnapshotId! / 10);
        n++
      )
        await pages.getByRole("button", { name: "Next", exact: true }).click();
      const last = sourceTable
        .locator("tbody tr")
        .filter({ hasText: `#${w.endSnapshotId} (` });
      await expect(last.locator("td").nth(w.gamerId + 2)).toContainText(
        ": unknown"
      );
    }
    await sourceTable.scrollIntoViewIfNeeded();
    if (c.after === null) {
      const pool = sourceTable
        .locator("tbody tr")
        .filter({ hasText: `#${w.endSnapshotId} (` })
        .locator("td")
        .nth(w.gamerId + 2);
      await pool.scrollIntoViewIfNeeded();
      await expect(pool).toBeInViewport({ ratio: 1 });
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(390);
    await page.screenshot({
      path: `/tmp/nufflizier-flow-${c.file}-mobile.png`
    });
    await page
      .getByLabel("Player ID or initial roster name")
      .fill("stale filter");
    await panel
      .getByRole("button", {
        name: `View ${w.decisionOrdinals.length} choices from window ${w.id + 1}`,
        exact: true
      })
      .click();
    await expect(
      page.getByLabel("Player ID or initial roster name")
    ).toHaveValue("");
    await expect(
      page.getByRole("heading", { name: "Replay evidence", exact: true })
    ).toBeFocused();
    await expect(page.getByRole("status")).toContainText(
      `${w.decisionOrdinals.length} matching events`
    );
    await page
      .getByRole("button", {
        name: `View team reroll choices (${report.rerollResources.decisionCount})`,
        exact: true
      })
      .click();
    await expect(page.getByRole("status")).toContainText(
      `${report.rerollResources.decisionCount} matching events`
    );
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download JSON" }).click();
    const saved = JSON.parse(
      readFileSync((await (await pending).path())!, "utf8")
    );
    expect(saved.schemaVersion).toBe("2.60");
    expect(saved.rerollResources.flow).toEqual(flow);
    await page.getByRole("button", { name: "Reset filters" }).click();
    await expect(page.getByLabel("Scoring status")).toHaveValue("scored");
    await page.getByRole("button", { name: "Upload Another Replay" }).click();
    await expect(panel).toHaveCount(0);
    expect(errors).toEqual([]);
  });
