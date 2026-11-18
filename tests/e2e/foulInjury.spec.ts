import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { fixedFoulArmorXml } from "../helpers/fixedFoulArmor";

test("[real-worker] scores direct foul injury separately from assisted armor", async ({
  page
}) => {
  await page.goto("/nufflizier");
  await page.setInputFiles('input[name="replay"]', {
    name: "ordinary-foul.xml",
    mimeType: "application/xml",
    buffer: Buffer.from(fixedFoulArmorXml(3, 5))
  });
  await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
  await expect(
    page.getByRole("heading", { name: "Nuffle Match Report" })
  ).toBeVisible();
  await page.getByText("Scoring details and source coverage", { exact: true }).click();
  await expect(page.getByText("Supported dice contribution gap: Not scored")).toBeVisible();
  await page.getByLabel("Category", { exact: true }).selectOption("injury");
  await page.getByLabel("Scoring status").selectOption("scored");
  const row = page.locator("tbody tr").filter({ hasText: "Injury: Stunned" });
  await expect(row.locator("td").nth(3)).toHaveText("Categorical");
  await row.locator("summary").click();
  await expect(row).toContainText(
    "The recorded assists change the armor odds only"
  );

  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).click();
  const report = JSON.parse(
    readFileSync((await (await pending).path())!, "utf8")
  );
  expect(report.schemaVersion).toBe("2.103");
  expect(report.events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        playerId: "44",
        teamId: "1",
        weightedDelta: 0.625,
        metadata: expect.objectContaining({
          injuryScoring: expect.objectContaining({
            cause: expect.objectContaining({ kind: "foul" })
          })
        })
      })
    ])
  );
  expect(report.verdict.luckierTeam).toBe("unknown");
  expect(report.verdict.scoreGap).toBeNull();
});
