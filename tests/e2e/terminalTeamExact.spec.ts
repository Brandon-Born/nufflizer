import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { lonerDriveXml } from "../helpers/lonerDrive";
import { withExactOrdinaryMoves } from "../helpers/exactOrdinaryMoves";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";

const cases = [
  {
    name: "replacement Dodge",
    fixture: "bb3-terminal-team-dodge",
    fragment: "direct_team_dodge_failure",
    candidates: ["38", "42", "46", "47"],
    category: "dodge",
    result: "3+ Dodge failed",
    odds: "66.7%",
    chance: 2 / 3,
    contribution: -4 / 3,
    policy: "team_reroll_terminal_moves"
  },
  {
    name: "original Rush",
    fixture: "bb3-kept-rush-moves",
    fragment: "retained_original_second_rush_failure",
    candidates: ["37", "38", "39", "40", "41", "42", "45", "47", "48"],
    category: "movement_risk",
    result: "2+ Movement risk failed",
    odds: "83.3%",
    chance: 5 / 6,
    contribution: -5 / 3,
    policy: "kept_rush_terminal_moves"
  }
];

for (const sample of cases)
  test(`explains exact teammate-move impact on an actual ${sample.name} die`, async ({
    page
  }) => {
    const xml = withExactOrdinaryMoves(
      lonerDriveXml(
        sample.fragment,
        `tests/fixtures/evidence/${sample.fixture}.json`
      ),
      sample.candidates,
      sample.candidates.slice(0, 2)
    );
    const expected = analyzeNufflizerInput(xml);
    await page.route("**/api/nufflizier/analyze", (route) =>
      route.fulfill({ status: 200, json: expected })
    );
    await page.goto("/nufflizier");
    await page.setInputFiles('input[name="replay"]', {
      name: "exact-movement.xml",
      mimeType: "application/xml",
      buffer: Buffer.from(xml)
    });
    await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
    await expect(
      page.getByRole("heading", { name: "Nuffle Match Report" })
    ).toBeVisible();
    await page
      .getByLabel("Category", { exact: true })
      .selectOption(sample.category);
    const row = page.locator("tbody tr").filter({ hasText: sample.result });
    await row.locator("summary").click();
    await expect(row).toContainText(`${sample.name} die had ${sample.odds}`);
    await expect(row).toContainText(
      `${sample.contribution.toFixed(3)} provisional context units`
    );

    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download JSON" }).click();
    const report = JSON.parse(
      readFileSync((await (await pending).path())!, "utf8")
    );
    expect(report.contextModelVersion).toBe("mobility-possession-56");
    expect(report.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          contextualImpact: expect.objectContaining({
            policy: sample.policy,
            components: { availableMoves: 2 },
            successChance: sample.chance,
            contribution: sample.contribution
          })
        })
      ])
    );
    expect(report.verdict.luckierTeam).toBe("unknown");
  });
