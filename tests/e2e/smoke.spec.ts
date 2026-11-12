import { lonerDriveXml } from "../helpers/lonerDrive";
import { activationContextXml } from "../helpers/activationReplay";
import { test, expect } from "@playwright/test";
import path from "node:path";
import { readFileSync } from "node:fs";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { contextReplayXml } from "../helpers/contextReplay";
import { playbackFragmentXml } from "../helpers/playback";
import { foulAppearancePlaybackXml } from "../helpers/foulAppearanceReplay";

const DEMO = path.resolve("demo-replays/demo1.bbr");

test("Foul Appearance and terminal mental failures retain distinct activation consequences", async ({
  page
}) => {
  await page.goto("/nufflizier");
  await page.setInputFiles('input[name="replay"]', {
    name: "sanitized-activation-loss.xml",
    mimeType: "application/xml",
    buffer: Buffer.from(foulAppearancePlaybackXml())
  });
  await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
  await expect(
    page.getByRole("heading", { name: "Nuffle Match Report" })
  ).toBeVisible();
  await page.getByLabel("Scoring status").selectOption("excluded");
  const row = page
    .locator("tbody tr")
    .filter({ hasText: "Foul Appearance failed; activation lost" })
    .filter({ hasText: "Player 42" });
  await row.locator("summary").click();
  await expect(row).toContainText(
    "Player 44 then acted in the same recorded team turn 8"
  );
  await expect(row).toContainText(
    "tactical cost of the lost activation remains unquantified"
  );
  await page.getByRole("button", { name: "Upload Another Replay" }).click();
  await page.setInputFiles('input[name="replay"]', {
    name: "activation-context.xml",
    mimeType: "application/xml",
    buffer: Buffer.from(activationContextXml("replacement"))
  });
  await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
  await expect(
    page.getByText(/Context: -0\.83 context units across 1 estimate/)
  ).toBeVisible();
  const later = page.locator("tbody tr").filter({ hasText: "Dodge failed" });
  await later.locator("summary").click();
  await expect(later).toContainText(
    "1 earlier player activation had already ended in this team turn"
  );
  await expect(later).toContainText("1 other standing teammate");
  await page.getByLabel("Scoring status").selectOption("excluded");
  const terminal = page
    .locator("tbody tr")
    .filter({ hasText: "Recorded teammate activation" });
  await terminal.locator("summary").click();
  await expect(terminal).toContainText(
    "lost the declared activation and tackle zone after Really Stupid failed"
  );
});

test("source-backed3+ gates and drive ends explain their distinct evidence", async ({
  page
}) => {
  await page.goto("/nufflizier");
  const cases = [
    {
      id: "loner3_block_pass",
      label: "Loner 3+ test passed",
      copy: "One team reroll was spent"
    },
    {
      id: "two_effects_drive_end",
      label: "Recorded drive-end mental effect expiry",
      copy: "setup flags add no luck score"
    }
  ];
  for (const [index, example] of cases.entries()) {
    if (index)
      await page.getByRole("button", { name: "Upload Another Replay" }).click();
    const xml = lonerDriveXml(example.id),
      report = analyzeNufflizerInput(xml);
    await page.route(
      "**/api/nufflizier/analyze",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(report)
        }),
      { times: 1 }
    );
    await page.setInputFiles('input[name="replay"]', {
      name: "source-fragment.xml",
      mimeType: "application/xml",
      buffer: Buffer.from(xml)
    });
    await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
    await expect(
      page.getByRole("heading", { name: "Nuffle Match Report" })
    ).toBeVisible();
    await page.getByLabel("Scoring status").selectOption("excluded");
    const row = page
      .locator("tbody tr")
      .filter({ hasText: example.label })
      .first();
    await row.locator("summary").click();
    await expect(row).toContainText(example.copy);
    if (!index) {
      await page.getByLabel("Scoring status").selectOption("scored");
      const replacement = page
        .locator("tbody tr")
        .filter({ hasText: "Block pool: Push opportunity" });
      await replacement.locator("summary").click();
      await expect(replacement).toContainText(
        "conditional on the recorded Loner pass"
      );
    }
  }
});

test("replacement purchases retain separate source-backed trait lists", async ({
  page
}) => {
  await page.goto("/nufflizier");
  await page.setInputFiles('input[name="replay"]', {
    name: "sanitized-recruitment.xml",
    mimeType: "application/xml",
    buffer: Buffer.from(playbackFragmentXml("008", "UI-087", [], [], true))
  });
  await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
  await expect(
    page.getByRole("heading", { name: "Nuffle Match Report" })
  ).toBeVisible();
  await expect(
    page.getByText(
      /Recorded mercenary purchase events: 2; linked roster observations: 2/
    )
  ).toBeVisible();
  await expect(
    page.getByText(/1 record reuses an earlier player ID/)
  ).toBeVisible();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).click();
  const download = await pending;
  const report = JSON.parse(readFileSync((await download.path())!, "utf8"));
  expect(
    report.recruitments.map((r: { playerId: string; playerTypeId: number }) => [
      r.playerId,
      r.playerTypeId
    ])
  ).toEqual([
    ["48", 1455],
    ["48", 1121]
  ]);
  expect(report.recruitments[1].innateSkills).toEqual([25, 44, 50, 54, 17]);
  expect(report.recruitments[1].acquiredSkills).toBeNull();
});

test("saved staff-question injury remains visible with unknown odds", async ({
  page
}) => {
  await page.goto("/nufflizier");
  await page.setInputFiles('input[name="replay"]', {
    name: "sanitized-ui025.xml",
    mimeType: "application/xml",
    buffer: Buffer.from(playbackFragmentXml("002", "UI-025", [], [42]))
  });
  await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
  await expect(
    page.getByRole("heading", { name: "Nuffle Match Report" })
  ).toBeVisible();
  await page.getByLabel("Category", { exact: true }).selectOption("injury");
  await page.getByLabel("Scoring status").selectOption("excluded");
  const row = page
    .locator("tbody tr")
    .filter({ hasText: "Observed injury dice" });
  await expect(row).toHaveCount(1);
  await row.locator("summary").click();
  await expect(
    row.getByText(
      /observed injury dice in a staff-choice question have no verified odds/
    )
  ).toBeVisible();
  await expect(row.getByText(/dice \[6, 1\]/)).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).click();
  const download = await downloadPromise;
  const report = JSON.parse(readFileSync((await download.path())!, "utf8"));
  expect(
    report.events.find(
      (e: { metadata: { sourceTag: string } }) =>
        e.metadata.sourceTag === "QuestionKORecovery"
    )
  ).toMatchObject({
    probabilitySuccess: null,
    actualSuccess: null,
    scoringStatus: "excluded",
    metadata: { dice: [6, 1], rollType: 11 }
  });
});

test("real final-turn carrier explains a scoring attempt at the left end zone", async ({
  page
}) => {
  await page.goto("/nufflizier");
  await page.setInputFiles(
    'input[name="replay"]',
    path.resolve("demo-replays/demo5.bbr")
  );
  await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
  await expect(
    page.getByRole("heading", { name: "Nuffle Match Report" })
  ).toBeVisible();
  await page
    .getByLabel("Category", { exact: true })
    .selectOption("movement_risk");
  // Raw reference 540/1 step8 is a final-turn Rush by carrier40.
  const row = page.locator("tbody tr").filter({ hasText: "source-3997" });
  await row.getByText("Why", { exact: true }).click();
  await expect(row).toContainText(
    "The carrier was attempting to enter the opponent's end zone."
  );
  await expect(row).toContainText("last scheduled turn of the recorded period");
  await expect(row).toContainText("team turn 16");
  await expect(row).toContainText("touchdown immediately after this move");
  await page.getByLabel("Half", { exact: true }).selectOption("second_half");
  await page.getByLabel("Team turn", { exact: true }).fill("16");
  await page.getByLabel("Player ID or initial roster name").fill("40");
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Show this activation" }).click();
  await expect(
    page.getByRole("button", { name: "Show all activations" })
  ).toBeVisible();
  await expect(row).toBeVisible();
  await page.getByLabel("Half", { exact: true }).selectOption("first_half");
  await expect(page.getByRole("status")).toContainText("No events match");
  await page
    .getByRole("button", { name: "Reset filters", exact: true })
    .click();
  await expect(page.getByLabel("Half", { exact: true })).toHaveValue("all");
  await expect(page.getByLabel("Team turn", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Player ID or initial roster name")).toHaveValue(
    ""
  );
  await expect(
    page.getByRole("button", { name: "Show all activations" })
  ).toHaveCount(0);
});

test("real BBR explains the pickup and touchdown around a carrier's Rush", async ({
  page
}) => {
  await page.goto("/nufflizier");
  await page.setInputFiles(
    'input[name="replay"]',
    path.resolve("demo-replays/demo8.bbr")
  );
  await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
  await expect(
    page.getByRole("heading", { name: "Nuffle Match Report" })
  ).toBeVisible();
  await page
    .getByLabel("Category", { exact: true })
    .selectOption("movement_risk");
  // Independently decoded demo8 step 103/1/9, the Rush after the Pickup.
  const row = page.locator("tbody tr").filter({ hasText: "source-730" });
  await row.getByText("Why", { exact: true }).click();
  await expect(row).toContainText(
    "The player was carrying the ball they picked up earlier in this activation."
  );
  await expect(row).toContainText(
    "The replay records a touchdown immediately after this move."
  );
});

test("real BBR upload exposes evidence, full filters, export and reset", async ({
  page
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/nufflizier");
  await expect(page).toHaveTitle(/Nufflizier/);
  await expect(
    page.getByRole("heading", { name: "Blessed by Nuffle Analyzer" })
  ).toBeVisible();
  await page.setInputFiles('input[name="replay"]', DEMO);
  const uploaded = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/nufflizier/analyze" &&
      response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
  const uploadResponse = await uploaded;
  const errorCode = uploadResponse.ok()
    ? "none"
    : ((await uploadResponse.json().catch(() => ({}))).code ?? "non-JSON");
  expect(
    uploadResponse.status(),
    `Real replay upload returned ${errorCode}`
  ).toBe(200);
  await expect(
    page.getByRole("heading", { name: "Nuffle Match Report" })
  ).toBeVisible();
  await expect(
    page.getByText(
      "Partial dice analysis. Whole-match luck cannot be determined from the supported evidence.",
      { exact: true }
    )
  ).toBeVisible();
  await expect(page.getByText(/Block: -?\d+\.\d+/).first()).toBeVisible();
  await page
    .getByLabel("Category", { exact: true })
    .selectOption("ball_handling");
  // Independent raw audit: eight fresh Status-1 Pickup/Catch records, the
  // team-rerolled Pickup at 336/0/1, and two retained originals from questions
  // at 60/0/3 (Pickup4+, die3) and 61/2/0 (Catch5+, die3), kept at 61/0/1
  // and 62/0/1 after Used0. One fresh Pickup is grouped with its verified
  // Sure Hands replacement below; unsupported stale/replacement records stay excluded.
  await expect(page.getByRole("status")).toContainText("11 matching events");
  await expect(
    page
      .locator("tbody tr")
      .filter({ hasText: /Ball handling (?:failed|succeeded)/ })
  ).toHaveCount(11);
  await page.locator("summary").first().click();
  await expect(page.getByText(/Source: source-/).first()).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).click();
  const download = await downloadPromise;
  const report = JSON.parse(readFileSync((await download.path())!, "utf8"));
  expect(report.schemaVersion).toBe("2.24");
  expect(report.modelVersion).toBe("dice-only-20");
  expect(
    report.events.some(
      (event: {
        metadata: {
          preRoll?: {
            suppressedTackleZones?: {
              playerId: string;
              providerSkillId: number;
            }[];
          };
        };
      }) =>
        event.metadata.preRoll?.suppressedTackleZones?.some(
          (p) => p.playerId === "37" && p.providerSkillId === 51
        )
    )
  ).toBe(true);
  expect(
    report.events.some(
      (event: { metadata: { mentalEffectEnd?: unknown } }) =>
        event.metadata.mentalEffectEnd
    )
  ).toBe(true);

  expect(report.contextModelVersion).toBe("mobility-possession-19");
  const context = report.coverage.contextEvidence;
  expect(context.rollCount).toBe(
    report.coverage.rollCandidates.scoredCount +
      report.coverage.rollCandidates.excludedCount
  );
  expect(context.quantifiedCount).toBe(
    report.events.filter(
      (event: { contextualImpact?: unknown }) =>
        event.contextualImpact !== undefined
    ).length
  );
  await expect(
    page.getByText(
      `Contextual impact quantified for ${context.quantifiedCount} of ${context.rollCount} roll candidates.`,
      { exact: false }
    )
  ).toBeVisible();
  // Independent raw decode: sequence 6 step 4 offers Push/Stumbles; away
  // chooses Stumbles (7/0/0) and outcome 6 resolves at 9/0/1.
  const firstBlock = report.events.find(
    (event: { metadata: { actionId?: string; block?: unknown } }) =>
      event.metadata.actionId === "sequence-6-step-4" && event.metadata.block
  );
  expect(firstBlock).toMatchObject({
    type: "block",
    scoringStatus: "scored",
    metadata: {
      block: { pool: { faces: [2, 3] }, selectedFace: 3, finalOutcome: 6 }
    }
  });
  expect(firstBlock.probabilitySuccess).toBeCloseTo(5 / 9, 12);
  expect(report.coverage.scoredByType.ball_handling).toBe(11);
  const keptPickup = report.events.find(
    (event: { metadata: { actionId?: string; rollType?: number } }) =>
      event.metadata.actionId === "sequence-61-step-0" &&
      event.metadata.rollType === 4
  );
  expect(keptPickup.metadata.pickupBallChain).toMatchObject({
    endingCell: { x: 3, y: 5 }
  });
  const pickupRow = page.locator("tbody tr").filter({
    hasText: `${keptPickup.metadata.sourceId}; action:`
  });
  if ((await pickupRow.locator("details").getAttribute("open")) === null)
    await pickupRow.getByText("Why", { exact: true }).click();
  await expect(pickupRow).toContainText(
    "2 recorded bounces and 1 linked catch check"
  );
  await expect(pickupRow).toContainText("last recorded landing was [3, 5]");
  await expect(pickupRow).toContainText(
    "The full tactical cost of possession or the turn remains unquantified"
  );
  // Independent raw decode at 86/1/messages 2–4: Pickup3+ die1, Sure Hands,
  // fresh die4. Retain both dice and score the single successful check.
  const pickup = report.events.find(
    (event: { metadata: { actionId?: string; rerollSkill?: string } }) =>
      event.metadata.actionId === "sequence-86-step-1" &&
      event.metadata.rerollSkill === "Sure Hands"
  );
  expect(pickup).toMatchObject({
    actualSuccess: true,
    scoringStatus: "scored",
    metadata: {
      rerollResource: "skill",
      teamRerollsSpent: 0,
      originalDice: { Die: { DieType: 0, Value: 1 } },
      dice: [4]
    }
  });
  expect(pickup.probabilitySuccess).toBeCloseTo(8 / 9, 12);
  const retained = report.events.filter(
    (event: { metadata: { rerollPolicy?: string } }) =>
      event.metadata.rerollPolicy?.startsWith("Retained original")
  );
  expect(retained).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        playerId: "11",
        probabilitySuccess: 1 / 2,
        actualSuccess: false,
        metadata: expect.objectContaining({
          rollType: 4,
          rerollAvailable: false,
          rerollUsed: false,
          originalDice: { Die: { DieType: 0, Value: 3 } }
        })
      }),
      expect.objectContaining({
        playerId: "1",
        probabilitySuccess: 1 / 3,
        actualSuccess: false,
        metadata: expect.objectContaining({
          rollType: 7,
          rerollAvailable: false,
          rerollUsed: false,
          originalDice: { Die: { DieType: 0, Value: 3 } }
        })
      })
    ])
  );
  expect(report.verdict.status).toBe("partial_analysis");
  await page
    .getByLabel("Category", { exact: true })
    .selectOption("movement_risk");
  const fallRow = page.locator("tbody tr").filter({ hasText: "source-2701" });
  await fallRow.getByText("Why", { exact: true }).click();
  await expect(fallRow).toContainText(
    "The player fell and the turn ended. Armor held."
  );
  await expect(fallRow).toContainText(
    "Dice subtotal for the movement check and scored damage: -0.42."
  );
  await fallRow.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/nufflizier-movement-fall.png" });
  await page.getByLabel("Category", { exact: true }).selectOption("block");
  await page.getByLabel("Scoring status").selectOption("excluded");
  await expect(page.getByRole("status")).toContainText("matching events");
  await expect(
    page.getByRole("columnheader", { name: "Replay segment" })
  ).toBeVisible();
  await page
    .getByRole("heading", { name: "Nuffle Match Report" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "/tmp/nufflizier-contract-desktop.png",
    fullPage: false
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Nuffle Match Report" })
  ).toBeVisible();
  await page.screenshot({
    path: "/tmp/nufflizier-contract-mobile.png",
    fullPage: false
  });
  await page.getByLabel("Player ID or initial roster name").fill("Player 22");
  await page.getByLabel("Half", { exact: true }).selectOption("second_half");
  await page.getByLabel("Team turn", { exact: true }).fill("16");
  await page.getByRole("button", { name: "Upload Another Replay" }).click();
  await expect(
    page.getByRole("heading", { name: "Nuffle Match Report" })
  ).toHaveCount(0);
  await page.setInputFiles(
    'input[name="replay"]',
    path.resolve("tests/fixtures/replays/sample-basic.xml")
  );
  await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
  await expect(
    page.getByText("Insufficient evidence to compare team luck.", {
      exact: true
    })
  ).toBeVisible();
  await expect(page.getByLabel("Category", { exact: true })).toHaveValue("all");
  await expect(page.getByLabel("Scoring status")).toHaveValue("scored");
  await expect(page.getByLabel("Player ID or initial roster name")).toHaveValue(
    ""
  );
  await expect(page.getByLabel("Half", { exact: true })).toHaveValue("all");
  await expect(page.getByLabel("Team turn", { exact: true })).toHaveValue("");
  await expect(
    page.getByText("No scored evidence", { exact: true })
  ).toHaveCount(2);
  expect(errors).toEqual([]);
});

test("complete pre-roll evidence explains the cost of an exposed pickup", async ({
  page
}) => {
  await page.goto("/nufflizier");
  await page.setInputFiles('input[name="replay"]', {
    name: "context.xml",
    mimeType: "application/xml",
    buffer: Buffer.from(
      contextReplayXml({ type: 4, exposed: true }).replaceAll(
        "<Data><Id>10</Id><InnateSkills></InnateSkills><AcquiredSkills/></Data>",
        "<Data><Id>10</Id><Name>Initial Runner</Name><InnateSkills><InnateSkillsItem>30</InnateSkillsItem><InnateSkillsItem>63</InnateSkillsItem></InnateSkills><AcquiredSkills/></Data>"
      )
    )
  });
  await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
  await expect(
    page.getByRole("heading", { name: "Nuffle Match Report" })
  ).toBeVisible();
  await expect(
    page.getByText(/Context: -3\.65 context units across 1 estimate/)
  ).toBeVisible();
  await page.getByLabel("Sort order", { exact: true }).selectOption("context");
  const row = page
    .locator("tbody tr")
    .filter({ hasText: "Ball handling failed" });
  await expect(row.getByText("First half, team turn 1")).toBeVisible();
  await row.locator("summary").click();
  await expect(
    row.getByText(/2 other standing teammates still able to move/)
  ).toBeVisible();
  await expect(
    row.getByText(/38% of eligible bounce squares are marked/)
  ).toBeVisible();
  await expect(row).toContainText("Player 10 (initial roster: Initial Runner)");
  await expect(row).toContainText(
    "recorded player data lists Block, Thick Skull"
  );
  await page.getByLabel("Player ID or initial roster name").fill("runner");
  await page.getByLabel("Half", { exact: true }).selectOption("first_half");
  await page.getByLabel("Team turn", { exact: true }).fill("1");
  await expect(row).toBeVisible();
  await page.getByLabel("Half", { exact: true }).selectOption("unknown");
  await expect(page.getByRole("status")).toContainText("No events match");
  await page.getByRole("button", { name: "Upload Another Replay" }).click();
  const suppressedXml = contextReplayXml({
    type: 4,
    exposed: true,
    mentalEffectPlayer: 40
  });
  const suppressedReport = analyzeNufflizerInput(suppressedXml);
  // This second UI state uses a production-service report without adding an
  // eleventh real upload to the suite's ten-per-minute API quota. The real
  // demo upload/export above separately verifies these fields through HTTP.
  await page.route("**/api/nufflizier/analyze", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(suppressedReport)
    })
  );
  await page.setInputFiles('input[name="replay"]', {
    name: "observed-effect.xml",
    mimeType: "application/xml",
    buffer: Buffer.from(suppressedXml)
  });
  await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
  await expect(
    page.getByText("Context: Not scored")
  ).toHaveCount(2);
  const suppressedRow = page
    .locator("tbody tr")
    .filter({ hasText: "Ball handling failed" });
  await suppressedRow.locator("summary").click();
  await expect(suppressedRow).toContainText(
    "Player 40 had no tackle zone under the recorded Really Stupid effect"
  );
  await expect(suppressedRow).toContainText(
    "Current skills or effects leave bounce reactions unresolved"
  );
});
test("invalid replay and hosting-generated text errors are understandable", async ({
  page
}) => {
  await page.goto("/nufflizier");
  await page.setInputFiles('input[name="replay"]', {
    name: "junk.xml",
    mimeType: "application/xml",
    buffer: Buffer.from("<hello>world</hello>")
  });
  await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
  await expect(
    page.getByText(/Unsupported replay document root/)
  ).toBeVisible();
  await page.route("**/api/nufflizier/analyze", (route) =>
    route.fulfill({
      status: 413,
      contentType: "text/html",
      body: "<html>Payload too large</html>"
    })
  );
  await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
  await expect(
    page.getByText("Upload or report is too large. Maximum file size is 4 MB.")
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Nuffle Match Report" })
  ).toHaveCount(0);
});

test("inconsistent success reports and upstream timeouts stay readable", async ({
  page
}) => {
  // This flow mocks malformed responses. Build its valid reference through
  // the production service without consuming another upload-quota slot.
  const report = analyzeNufflizerInput(
    readFileSync(
      path.resolve("tests/fixtures/replays/sample-basic.xml"),
      "utf8"
    )
  );
  report.teams[0].luckScore = 42;
  let timeout = false;
  await page.route("**/api/nufflizier/analyze", (route) =>
    timeout
      ? route.fulfill({
          status: 504,
          contentType: "text/html",
          body: "<html>upstream timeout</html>"
        })
      : route.fulfill({ status: 200, json: report })
  );
  await page.goto("/nufflizier");
  await page.setInputFiles(
    'input[name="replay"]',
    path.resolve("tests/fixtures/replays/sample-basic.xml")
  );
  await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
  await expect(
    page.getByText(
      "The report format or totals are inconsistent. Please reload and retry."
    )
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Nuffle Match Report" })
  ).toHaveCount(0);
  timeout = true;
  await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
  await expect(
    page.getByText("Analysis timed out. Try a smaller replay.")
  ).toBeVisible();
});

test("cancelling an upload returns to an idle form without a fabricated report", async ({
  page
}) => {
  await page.route("**/api/nufflizier/analyze", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({ status: 200, json: {} }).catch(() => {});
  });
  await page.goto("/nufflizier");
  await page.setInputFiles(
    'input[name="replay"]',
    path.resolve("tests/fixtures/replays/sample-basic.xml")
  );
  await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
  await page.getByRole("button", { name: "Cancel analysis" }).click();
  await expect(
    page.getByText("Analysis cancelled.", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Analyze Nuffle Luck" })
  ).toBeEnabled();
  await expect(
    page.getByRole("heading", { name: "Nuffle Match Report" })
  ).toHaveCount(0);
});

test("block skills explain Wrestle and subject-specific damage without double counting", async ({
  page
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/nufflizier");
  await expect(page).toHaveTitle("Nufflizier");
  await expect(page).toHaveURL("http://127.0.0.1:3000/nufflizier");
  const cases = [
    {
      source: "012",
      id: "UI-074",
      home: [11],
      away: [42],
      copy: "went prone through Wrestle",
      skill: "Wrestle by player 42"
    },
    {
      source: "014",
      id: "UI-076",
      home: [3],
      away: [39],
      copy: "defender 39 was knocked down",
      skill: "Block by player 3"
    }
  ];
  for (const [index, example] of cases.entries()) {
    if (index)
      await page.getByRole("button", { name: "Upload Another Replay" }).click();
    const xml = playbackFragmentXml(
        example.source,
        example.id,
        example.home,
        example.away
      ),
      report = analyzeNufflizerInput(xml);
    await page.route("**/api/nufflizier/analyze", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(report)
      })
    );
    await page.setInputFiles('input[name="replay"]', {
      name: "source-block.xml",
      mimeType: "application/xml",
      buffer: Buffer.from(xml)
    });
    await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
    await expect(
      page.getByRole("heading", { name: "Nuffle Match Report" })
    ).toBeVisible();
    const row = page.locator("tbody tr").filter({ hasText: "Block pool:" });
    await row.locator("summary").click();
    await expect(row).toContainText(example.copy);
    await expect(row).toContainText("Raw target missed");
    await expect(row).toContainText(example.skill);
    await expect(row).toContainText("existing dice contributions once");
    if (index) {
      await expect(row).toContainText("1 immediately linked damage step");
      await expect(row).toContainText("2 damage rolls have unknown odds");
    } else
      await expect(row).toContainText(
        "Wrestle does not add a knockdown armor check"
      );
    if (index)
      await page.screenshot({
        path: "/tmp/nufflizier-block-consequences-desktop.png",
        fullPage: true
      });
    await page.unroute("**/api/nufflizier/analyze");
  }
  expect(errors).toEqual([]);
});

test("real-source Dodge uncertainty and active continuation stay outside point totals", async ({
  page
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/nufflizier");
  const cases = [
    {
      id: "terminal_dodge_failure",
      others: 7,
      range: "-5.33 to 0.00 context units",
      copy: "also uncertain (0 to 1 option)"
    },
    {
      id: "terminal_dodge_success",
      others: 9,
      range: "0.33 to 3.33 context units",
      copy: "retain one further ordinary move in this activation"
    }
  ];
  for (const [index, c] of cases.entries()) {
    const replayXml = lonerDriveXml(
        c.id,
        "tests/fixtures/evidence/bb3-dodge-successors.json"
      ),
      report = analyzeNufflizerInput(replayXml);
    await page.route("**/api/nufflizier/analyze", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(report)
      })
    );
    await page.setInputFiles('input[name="replay"]', {
      name: "source-dodge.xml",
      mimeType: "application/xml",
      buffer: Buffer.from(replayXml)
    });
    await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
    await expect(
      page.getByRole("heading", { name: "Nuffle Match Report" })
    ).toBeVisible();
    await expect(
      page.getByText(/Separate context ranges are available for 1 check/)
    ).toBeVisible();
    await page.getByLabel("Scoring status").selectOption("bounded");
    const row = page
      .getByRole("table")
      .filter({
        has: page.getByRole("columnheader", { name: "Replay segment" })
      })
      .locator("tbody tr");
    await expect(row).toHaveCount(1);
    await row.locator("summary").click();
    await expect(row).toContainText(`0 to ${c.others} other players`);
    await expect(row).toContainText("terminal die had 66.7% success");
    await expect(row).toContainText(c.range);
    await expect(row).toContainText(c.copy);
    await expect(row).toContainText("No midpoint is added to point totals");
    if (c.id === "terminal_dodge_success") {
      await expect(row).toContainText("replay confirms this move after the successful Dodge skill reroll");
      await expect(row).toContainText("5 movement points remained after this step");
      await expect(row).toContainText("observed movement adds no luck score");
    }
    await expect(page.getByText("Context: Not scored")).toHaveCount(2);
    await page.screenshot({
      path: index
        ? "/tmp/nufflizier-active-continuation-desktop.png"
        : "/tmp/nufflizier-dodge-bounds-desktop.png",
      fullPage: true
    });
    await page.getByRole("button", { name: "Upload Another Replay" }).click();
    await expect(page.getByLabel("Scoring status")).toHaveCount(0);
    await page.unroute("**/api/nufflizier/analyze");
  }
  expect(errors).toEqual([]);
});


test("source-backed Sure Hands bounds preserve pending catch and reaction uncertainty",async({page})=>{
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type() === "error")errors.push(m.text());});
  await page.goto("/nufflizier");
  await expect(page).toHaveTitle(/Nufflizier/);
  for(const c of [{id:"pickup_terminal_success",branches:"3 empty, 5 occupied and 0 off-pitch",range:"0.00 to 0.88 context units"},{id:"pickup_terminal_failure",branches:"8 empty, 0 occupied and 0 off-pitch",range:"-1.33 to 0.00 context units"}]) {
    const xml=lonerDriveXml(c.id,"tests/fixtures/evidence/bb3-pickup-successors.json"),report=analyzeNufflizerInput(xml);
    await page.route("**/api/nufflizier/analyze",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(report)}));
    await page.setInputFiles('input[name="replay"]',{name:"source-pickup.xml",mimeType:"application/xml",buffer:Buffer.from(xml)});
    await page.getByRole("button",{name:"Analyze Nuffle Luck"}).click();
    await expect(page.getByRole("heading",{name:"Nuffle Match Report"})).toBeVisible();
    await page.getByLabel("Scoring status").selectOption("bounded");
    const row=page.getByRole("table").filter({has:page.getByRole("columnheader",{name:"Replay segment"})}).locator("tbody tr");
    await expect(row).toHaveCount(1);await row.locator("summary").click();
    await expect(row).toContainText("Sure Hands already committed");await expect(row).toContainText("terminal die had 66.7% success");
    await expect(row).toContainText(c.branches);await expect(row).toContainText(c.range);
    if(c.id === "pickup_terminal_success") {
      await expect(row).toContainText("Sure Hands replacement secured the ball at [11, 10]");
      await expect(row).toContainText("post-move budget stays at 4 movement points");
      await expect(row).toContainText("observed possession adds no luck score");
    }
    await expect(row).toContainText("reaction skills or effects are incomplete");await expect(row).toContainText("later catch/return dice");
    await expect(row).toContainText("No midpoint or range endpoint enters point totals");await expect(row).toContainText("88.9%");
    await expect(page.getByText("Context: Not scored")).toHaveCount(2);
    await page.screenshot({path:c.id.endsWith("success")?"/tmp/nufflizier-pickup-successors-desktop.png":"/tmp/nufflizier-pickup-failure-desktop.png",fullPage:true});
    await page.getByRole("button",{name:"Reset filters",exact:true}).click();await expect(page.getByLabel("Scoring status")).toHaveValue("scored");
    await page.getByRole("button",{name:"Upload Another Replay"}).click();await expect(page.getByLabel("Scoring status")).toHaveCount(0);
    await page.unroute("**/api/nufflizier/analyze");
  }
  expect(errors).toEqual([]);
});


test("occupied-bounce catches preserve turnover opportunities and unknown stand-up budget",async({page})=>{
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
  await page.goto("/nufflizier");await expect(page).toHaveTitle("Nufflizier");
  for(const c of [
    {id:"pickup_bounce_catch",chance:"16.7%",range:"0 to 1.67",opportunities:"0 to 10 other players",image:"turnend-opportunities"},
    {id:"standup_pickup_bounce_catch",chance:"50.0%",range:"0 to 1.00",opportunities:"Current-side movement opportunities remain unknown",image:"standup-catch"}
  ]) {
    const xml=lonerDriveXml(c.id,"tests/fixtures/evidence/bb3-bounce-catch-reactions.json"),report=analyzeNufflizerInput(xml);
    await page.route("**/api/nufflizier/analyze",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(report)}));
    await page.setInputFiles('input[name="replay"]',{name:"source-catch.xml",mimeType:"application/xml",buffer:Buffer.from(xml)});
    await page.getByRole("button",{name:"Analyze Nuffle Luck"}).click();await expect(page.getByRole("heading",{name:"Nuffle Match Report"})).toBeVisible();
    const table=page.getByRole("table").filter({has:page.getByRole("columnheader",{name:"Replay segment"})});
    const pickup=table.locator("tbody tr").filter({hasText:"The failed pickup led to"});
    await expect(pickup).toHaveCount(1);await pickup.locator("summary").click();
    await expect(pickup).toContainText("recorded team turn ended immediately after the successful catch");
    await expect(pickup).toContainText(c.opportunities);await expect(pickup).toContainText("does not establish a hypothetical failed-roll reroll policy");
    if(c.id === "standup_pickup_bounce_catch") {
      await expect(pickup).toContainText("stood up earlier in this activation");
      await expect(pickup).toContainText("stand-up cost timing is unverified");
      await expect(pickup).not.toContainText("7 movement points");
    }
    await page.screenshot({path:`/tmp/nufflizier-${c.image}-desktop.png`,fullPage:true});
    await page.getByLabel("Scoring status").selectOption("bounded");
    const row=table.locator("tbody tr");await expect(row).toHaveCount(1);await row.locator("summary").click();
    await expect(row).toContainText("recorded catcher after a failed pickup");await expect(row).toContainText(`${c.chance} raw success`);
    await expect(row).toContainText(`${c.range} context units`);await expect(row).toContainText("Failed-catch rerolls, reactions and later bounces are unresolved");
    await expect(row).toContainText("No midpoint or endpoint enters point totals");await expect(page.getByText("Context: Not scored")).toHaveCount(2);
    await page.getByRole("button",{name:"Reset filters",exact:true}).click();await expect(page.getByLabel("Scoring status")).toHaveValue("scored");
    await page.getByRole("button",{name:"Upload Another Replay"}).click();await expect(page.getByLabel("Scoring status")).toHaveCount(0);
    await page.unroute("**/api/nufflizier/analyze");
  }
  expect(errors).toEqual([]);
});

test("reroll counters separate resource observations from dice and unknown resets",async({page})=>{
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
  await page.goto("/nufflizier");await expect(page).toHaveTitle("Nufflizier");
  for(const c of [
    {id:"numeric_rush_spent",change:"from 3 to 2 matches this decision",label:"Recorded team reroll used"},
    {id:"numeric_dodge_declined",change:"from 5 to 5 matches this decision",label:"Recorded team reroll declined"},
    {id:"loner4_spent_fail",change:"from 3 to 2 matches this decision",label:"Recorded team reroll spend"},
    {id:"missing_zero_and_period",change:"next same-turn counter is unknown",label:"Recorded team reroll spend"},
    {id:"block_loner3_spent_pass",change:"from 2 to 1 matches this decision",label:"Recorded team reroll spend"},
    {id:"block_loner3_spent_fail",change:"next same-turn counter is unknown",label:"Recorded team reroll spend"}
  ]) {
    const xml=lonerDriveXml(c.id,"tests/fixtures/evidence/bb3-reroll-counters.json"),report=analyzeNufflizerInput(xml);
    await page.route("**/api/nufflizier/analyze",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(report)}));
    await page.setInputFiles('input[name="replay"]',{name:"source-resources.xml",mimeType:"application/xml",buffer:Buffer.from(xml)});
    await page.getByRole("button",{name:"Analyze Nuffle Luck"}).click();await expect(page.getByRole("heading",{name:"Nuffle Match Report"})).toBeVisible();
    const table=page.getByRole("table").filter({has:page.getByRole("columnheader",{name:"Replay segment"})});
    if(c.id === "numeric_rush_spent") {
      const roll=table.locator("tbody tr").filter({hasText:"97.2%"});await expect(roll).toHaveCount(1);await roll.locator("summary").click();
      await expect(roll).toContainText(c.change);
    }
    if(c.id.startsWith("block_")) {
      const pools=table.locator("tbody tr").filter({hasText:"Block pool:"});
      await expect(pools).toHaveCount(c.id.endsWith("pass")?2:1);
      await pools.first().locator("summary").click();await expect(pools.first()).toContainText(c.change);
      await expect(pools.first()).toContainText("55.6%");
      if(c.id.endsWith("pass")) {await pools.nth(1).locator("summary").click();await expect(pools.nth(1)).toContainText(c.change);}
    }
    await page.getByLabel("Scoring status").selectOption("excluded");
    const row=table.locator("tbody tr").filter({hasText:c.label});await expect(row).toHaveCount(1);await row.locator("summary").click();
    await expect(row).toContainText(c.change);await expect(row).toContainText("not included in luck points");
    if(c.id === "numeric_dodge_declined") await expect(row).toContainText("no team reroll was spent on this decision");
    if(c.id === "loner4_spent_fail") {
      const gate=table.locator("tbody tr").filter({hasText:"Loner 4+ test failed"});await gate.locator("summary").click();
      await expect(gate).toContainText(c.change);
    }
    if(c.id === "missing_zero_and_period") await expect(row).toContainText("missing counter is not treated as zero");
    await expect(page.getByText("Context: Not scored")).toHaveCount(2);
    await page.screenshot({path:`/tmp/nufflizier-reroll-counter-${c.id}.png`,fullPage:true});
    await page.getByRole("button",{name:"Reset filters",exact:true}).click();await expect(page.getByLabel("Scoring status")).toHaveValue("scored");
    await page.getByRole("button",{name:"Upload Another Replay"}).click();await expect(page.getByLabel("Scoring status")).toHaveCount(0);
    await page.unroute("**/api/nufflizier/analyze");
  }
  expect(errors).toEqual([]);
});

// Source-derived response through the real rendered upload/report interaction;
// full original demo5 also passes the separate worker/API acceptance test.
test("team-rerolled movement separates actual cells from missing context",async({page})=>{
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
  await page.goto("/nufflizier");await expect(page).toHaveTitle("Nufflizier");
  for(const id of ["team_rush_carrier","team_rush_touchdown","team_dodge_missing_period"]) {
    const xml=lonerDriveXml(id,"tests/fixtures/evidence/bb3-team-reroll-movement.json"),report=analyzeNufflizerInput(xml);
    await page.route("**/api/nufflizier/analyze",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(report)}));
    await page.setInputFiles('input[name="replay"]',{name:"source-rush.xml",mimeType:"application/xml",buffer:Buffer.from(xml)});
    await page.getByRole("button",{name:"Analyze Nuffle Luck"}).click();await expect(page.getByRole("heading",{name:"Nuffle Match Report"})).toBeVisible();
    const table=page.getByRole("table").filter({has:page.getByRole("columnheader",{name:"Replay segment"})});
    const row=table.locator("tbody tr").filter({hasText:"successful team-rerolled"});
    await expect(row).toHaveCount(1);await row.locator("summary").click();
    await expect(row).toContainText(id.startsWith("team_dodge")?"88.9%":"97.2%");
    if(id.startsWith("team_dodge"))await expect(row).toContainText("3 movement points remained after this step");
    else {await expect(row).toContainText("explicitly held ball followed");await expect(row).toContainText("waiting snapshot omitted remaining movement");}await expect(row).toContainText("actual movement adds no luck score");
    if(id==="team_rush_touchdown")await expect(row).toContainText("touchdown immediately after this move");
    await expect(page.getByText("Context: Not scored")).toHaveCount(2);
    await page.screenshot({path:`/tmp/nufflizier-${id}-desktop.png`,fullPage:true});
    await page.getByLabel("Scoring status").selectOption("bounded");
    // The Dodge fragment also contains an earlier own-skill component range.
    // The new actual team-rerolled move itself never becomes a context range.
    await expect(row).toHaveCount(0);
    await expect(table.locator("tbody tr").filter({has:page.locator("summary")})).toHaveCount(id.startsWith("team_dodge")?1:0);
    await page.getByRole("button",{name:"Reset filters",exact:true}).click();await expect(page.getByLabel("Scoring status")).toHaveValue("scored");
    await page.getByRole("button",{name:"Upload Another Replay"}).click();await expect(page.getByLabel("Scoring status")).toHaveCount(0);
    await page.unroute("**/api/nufflizier/analyze");
  }
  expect(errors).toEqual([]);
});
