import { envelope, sequence, rollXml } from "../helpers/replay";
import { lonerDriveXml } from "../helpers/lonerDrive";
import { activationContextXml } from "../helpers/activationReplay";
import { test, expect } from "@playwright/test";
import path from "node:path";
import { readFileSync } from "node:fs";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { contextReplayXml } from "../helpers/contextReplay";
import { playbackFragmentXml } from "../helpers/playback";
import { foulAppearancePlaybackXml } from "../helpers/foulAppearanceReplay";
import { ownershipReplayXml } from "../helpers/ownershipReplay";
import { blockBallPlaybackXml } from "../helpers/blockBallRelease";

test("ordinary push alternatives separate coach choices from dice and pre-roll context", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  const report = analyzeNufflizerInput(
    readFileSync("demo-replays/demo5.bbr", "utf8"),
  );
  await page.route("**/api/nufflizier/analyze", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(report),
    }),
  );
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/nufflizier");
  expect(page.url()).toBe("http://127.0.0.1:3000/nufflizier");
  await expect(page).toHaveTitle(/Nufflizier/);
  await page.setInputFiles(
    'input[name="replay"]',
    path.resolve("demo-replays/demo5.bbr"),
  );
  await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
  await expect(
    page.getByRole("heading", { name: "Nuffle Match Report" }),
  ).toBeVisible();
  await page.getByLabel("Scoring status").selectOption("scored");
  const row = page
    .locator("tbody tr")
    .filter({ hasText: "Source: source-98;" });
  await expect(row).toHaveCount(1);
  await row.locator("summary").click();
  await expect(row).toContainText(
    "After die selection, the recorded menu offers 2 destination squares",
  );
  await expect(row).toContainText("4 position branches");
  await expect(row).toContainText(
    "These coach choices carry no random probability or extra luck score",
  );
  await expect(row).toContainText("this is not pre-roll leverage");
  await expect(row).toContainText("Ball/terrain reactions");
  await page.getByLabel("Player ID or initial roster name").fill("45");
  const continued = page.locator("tbody tr").filter({hasText:"Source: source-367;"});
  await expect(continued).toHaveCount(1);
  await continued.locator("summary").click();
  await expect(continued).toContainText("After die selection");
  await expect(continued).toContainText("not added to dice or context totals");
  await continued.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/nufflizier-trait-desktop.png" });
  await page.getByLabel("Player ID or initial roster name").fill("");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Scoring status").selectOption("excluded");
  const menu = page
    .locator("tbody tr")
    .filter({ hasText: "Source: source-101;" });
  await expect(menu).toHaveCount(1);
  await menu.locator("summary").click();
  await expect(menu).toContainText("Observed push menu addressed to slot 0");
  await expect(menu).toContainText(
    "does not establish current skill eligibility or a tactical score",
  );
  await menu.locator("td").nth(2).scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "/tmp/nufflizier-trait-mobile.png" });
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).click();
  const saved = JSON.parse(
      readFileSync((await (await pending).path())!, "utf8"),
    ),
    event = saved.events.find(
      (e: { metadata: { sourceId: string } }) =>
        e.metadata.sourceId === "source-98",
    );
  expect(saved.schemaVersion).toBe("2.50");
  expect(saved.contextModelVersion).toBe("mobility-possession-38");
  expect(event.metadata.blockPush.branches).toHaveLength(4);
  const later = saved.events.find((e:{metadata:{sourceId:string}})=>e.metadata.sourceId==="source-367");
  expect(later.metadata.blockPush.status).toBe("modeled");
  expect(later.metadata.block.traitEvidence.attacker.observedCheckpointAfter).toBe(0);
  expect(
    saved.teams.every((t: { impactCount: number }) => t.impactCount === 0),
  ).toBe(true);
  expect(saved.verdict.luckierTeam).toBe("unknown");
  expect(await page.locator("nextjs-portal").count()).toBe(0);
  await page.getByRole("button", { name: "Upload Another Replay" }).click();
  await expect(page.getByLabel("Scoring status")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("current ownership and stale defender conflicts remain clear through export and reset", async ({
  page
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/nufflizier");
  expect(page.url()).toBe("http://127.0.0.1:3000/nufflizier");
  await expect(page).toHaveTitle(/Nufflizier/);
  await page.screenshot({ path: "/tmp/nufflizier-ownership-entry.png" });
  for (const conflict of [false, true]) {
    const input = ownershipReplayXml(
        conflict
          ? { kind: "block", defenderTeam: 0 }
          : { kind: "block", initialActor: "missing" }
      ),
      report = analyzeNufflizerInput(input);
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
      name: "ownership.xml",
      mimeType: "application/xml",
      buffer: Buffer.from(input)
    });
    await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
    await expect(
      page.getByRole("heading", { name: "Nuffle Match Report" })
    ).toBeVisible();
    await page
      .getByLabel("Scoring status")
      .selectOption(conflict ? "excluded" : "scored");
    const event = report.events.find((e) => e.metadata.isRollCandidate)!,
      row = page.locator("tbody tr").filter({ hasText: `Source: ${event.metadata.sourceId};` });
    await expect(row).toHaveCount(1);
    await row.locator("summary").click();
    if (conflict) {
      await expect(row).toContainText(
        "Ownership unresolved for defender player 7"
      );
      await expect(row).toContainText(
        "current membership contradicts the earlier roster"
      );
      await expect(row).toContainText("adds no luck score");
    } else {
      await expect(row).toContainText("actor player 42 belongs to team 0");
      await expect(row).toContainText(
        "current roster observation before this outcome"
      );
      await expect(row).toContainText(
        "Defender player 7 belongs to opposing team 1"
      );
      await expect(row).toContainText(
        "Ownership alone does not establish current skills"
      );
    }
    await row.scrollIntoViewIfNeeded();
    if (conflict) await page.setViewportSize({ width: 390, height: 844 });
    await row.locator("td").nth(2).scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(conflict ? 390 : 1280);
    await page.screenshot({
      path: conflict
        ? "/tmp/nufflizier-ownership-mobile.png"
        : "/tmp/nufflizier-ownership-desktop.png"
    });
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download JSON" }).click();
    const file = await pending,
      saved = JSON.parse(readFileSync((await file.path())!, "utf8")),
      out = saved.events.find(
        (e: { metadata: { isRollCandidate: boolean } }) =>
          e.metadata.isRollCandidate
      );
    expect(saved.schemaVersion).toBe("2.50");
    expect(saved.modelVersion).toBe("dice-only-25");
    expect(saved.verdict.luckierTeam).toBe("unknown");
    if (conflict) {
      expect(out.teamId).toBe("unresolved");
      expect(out.metadata.ownershipConflict.role).toBe("defender");
      expect(out.probabilitySuccess).toBeNull();
    } else
      expect(out.metadata.ownership).toMatchObject({
        playerId: "42",
        basis: "current_roster",
        teamId: "0",
        defender: { playerId: "7", teamId: "1" }
      });
    expect(await page.locator("nextjs-portal").count()).toBe(0);
    await page.getByRole("button", { name: "Upload Another Replay" }).click();
    await expect(page.getByLabel("Scoring status")).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test("block carrier bounce explains source motion while omitted possession stays unknown",async({page})=>{
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
  const input=blockBallPlaybackXml(),report=analyzeNufflizerInput(input);
  // Original demo5 passes through the existing real-worker HTTP admission;
  // this paired-UI projection checks presentation without an eleventh POST.
  await page.route("**/api/nufflizier/analyze",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(report)}));
  await page.setViewportSize({width:1280,height:800});await page.goto("/nufflizier");
  expect(page.url()).toBe("http://127.0.0.1:3000/nufflizier");await expect(page).toHaveTitle(/Nufflizier/);
  await page.setInputFiles('input[name="replay"]',{name:"paired-carrier.xml",mimeType:"application/xml",buffer:Buffer.from(input)});
  await page.getByRole("button",{name:"Analyze Nuffle Luck"}).click();await expect(page.getByRole("heading",{name:"Nuffle Match Report"})).toBeVisible();
  const row=page.locator("tbody tr").filter({hasText:"Block pool: Both Down opportunity"});await expect(row).toHaveCount(1);
  await row.locator("summary").click();await expect(row).toContainText("Player 5 held the ball at [4,10]");
  await expect(row).toContainText("first recorded bounce travels to [4,9]");await expect(row).toContainText("omitted holder flags do not establish a loose ball or a new carrier");
  await expect(row).toContainText("source link adds no dice score or tactical value");
  await row.scrollIntoViewIfNeeded();await page.screenshot({path:"/tmp/nufflizier-block-ball-desktop.png",fullPage:false});
  await page.getByLabel("Scoring status").selectOption("excluded");await expect(row).toHaveCount(0);
  await page.getByLabel("Scoring status").selectOption("scored");await row.locator("summary").click();
  await page.setViewportSize({width:390,height:844});await row.locator("td").nth(2).scrollIntoViewIfNeeded();
  await expect(row.getByText(/first recorded bounce travels/)).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({path:"/tmp/nufflizier-block-ball-mobile.png",fullPage:false});
  const pending=page.waitForEvent("download");await page.getByRole("button",{name:"Download JSON"}).click();const download=await pending;
  const saved=JSON.parse(readFileSync((await download.path())!,"utf8"));
  expect(saved.schemaVersion).toBe("2.50");expect(saved.contextModelVersion).toBe("mobility-possession-38");
  const p=saved.events.find((e:{metadata:{blockBallRelease?:unknown}})=>e.metadata.blockBallRelease);
  expect(p.metadata.blockBallRelease).toMatchObject({holderId:"5",holderTeamId:"0",from:{x:4,y:10},to:{x:4,y:9}});
  expect(p.metadata.blockBallRelease.after).toBeUndefined();expect(saved.verdict.luckierTeam).toBe("unknown");
  expect(saved.teams.every((t:{impactCount:number})=>t.impactCount===0)).toBe(true);expect(await page.locator("nextjs-portal").count()).toBe(0);
  await page.getByRole("button",{name:"Upload Another Replay"}).click();await expect(page.getByLabel("Scoring status")).toHaveCount(0);expect(errors).toEqual([]);
});

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
    page.getByText(/Context points: -0\.83 context units across 1 estimate/)
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
    .filter({ hasText: "Recorded injury: KO (not scored)" });
  await expect(row).toHaveCount(1);
  await row.locator("summary").click();
  await expect(
    row.getByText(
      /recorded injury outcome has no verified odds/
    )
  ).toBeVisible();
  await expect(row.getByText(/2D6 injury \[6, 1\]/)).toBeVisible();
  await expect(row.locator("td").nth(3)).toHaveText("Unknown");
  await expect(row.locator("td").nth(4)).toHaveText("KO (recorded)");
  await expect(row.locator("td").nth(5)).toHaveText("Not scored");
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
    metadata: { dice: [6, 1], rollType: 11, injuryObservation:{outcome:"ko",recordKind:"embedded_ko",sourceCode:16} }
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
  await page.locator("tbody tr summary").first().click();
  await expect(page.getByText(/Source: source-/).first()).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).click();
  const download = await downloadPromise;
  const report = JSON.parse(readFileSync((await download.path())!, "utf8"));
  expect(report.schemaVersion).toBe("2.50");
  const keptCatch=report.events.find((e:{metadata:{sourceId:string}})=>e.metadata.sourceId==="source-548");
  expect(keptCatch.catchPossessionBounds).toMatchObject({policy:"kept_catch_failure_envelope",lower:-2/3,upper:0});
  expect(report.modelVersion).toBe("dice-only-25");
  expect(report.events.filter((e:{metadata:{combinedMovement?:unknown}})=>e.metadata.combinedMovement)).toHaveLength(2);
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

  expect(report.contextModelVersion).toBe("mobility-possession-38");
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
          probabilityPolicy: "single_attempt",
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
          probabilityPolicy: "single_attempt",
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
    page.getByText(/Context points: -3\.65 context units across 1 estimate/)
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
    page.getByText("Context points: Not scored")
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
    await expect(page.getByText("Context points: Not scored")).toHaveCount(2);
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
    await expect(page.getByText("Context points: Not scored")).toHaveCount(2);
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
    await expect(row).toContainText("No midpoint or endpoint enters point totals");await expect(page.getByText("Context points: Not scored")).toHaveCount(2);
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
    if(c.id === "numeric_dodge_declined") {
      const kept=table.locator("tbody tr").filter({hasText:"Dodge failed"});await expect(kept).toHaveCount(1);await kept.locator("summary").click();
      await expect(kept).toContainText("odds policy one attempt");await expect(kept).not.toContainText("reroll available no");
      await expect(page.getByText("A single-attempt calculation does not establish whether a reroll was available. Recorded choices and counter observations are separate evidence.")).toBeVisible();
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
    await expect(page.getByText("Context points: Not scored")).toHaveCount(2);
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
    await expect(page.getByText("Context points: Not scored")).toHaveCount(2);
    await page.screenshot({path:`/tmp/nufflizier-${id}-desktop.png`,fullPage:true});
    await page.getByLabel("Scoring status").selectOption("bounded");
    // The Dodge fragment has its earlier own-skill range and the distinct
    // conditional terminal team-Dodge component; actual movement is unscored.
    await expect(row).toHaveCount(id.startsWith("team_dodge")?1:0);
    await expect(table.locator("tbody tr").filter({has:page.locator("summary")})).toHaveCount(id.startsWith("team_dodge")?2:0);
    await page.getByRole("button",{name:"Reset filters",exact:true}).click();await expect(page.getByLabel("Scoring status")).toHaveValue("scored");
    await page.getByRole("button",{name:"Upload Another Replay"}).click();await expect(page.getByLabel("Scoring status")).toHaveCount(0);
    await page.unroute("**/api/nufflizier/analyze");
  }
  expect(errors).toEqual([]);
});

test("fixed-zone Dodge reaches the pickup square and Sure Hands secures possession",async({page})=>{
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
  const xml=lonerDriveXml("team_dodge_zone_pickup","tests/fixtures/evidence/bb3-team-reroll-movement.json"),report=analyzeNufflizerInput(xml);
  await page.route("**/api/nufflizier/analyze",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(report)}));
  await page.goto("/nufflizier");await expect(page).toHaveTitle("Nufflizier");
  await page.setInputFiles('input[name="replay"]',{name:"source-zone-pickup.xml",mimeType:"application/xml",buffer:Buffer.from(xml)});
  await page.getByRole("button",{name:"Analyze Nuffle Luck"}).click();await expect(page.getByRole("heading",{name:"Nuffle Match Report"})).toBeVisible();
  const table=page.getByRole("table").filter({has:page.getByRole("columnheader",{name:"Replay segment"})});
  const movement=table.locator("tbody tr").filter({hasText:"successful team-rerolled Dodge"});
  await expect(movement).toHaveCount(1);await movement.locator("summary").click();
  await expect(movement).toContainText("1 opposing tackle-zone penalty point");await expect(movement).toContainText("[17, 5] to [17, 6]");
  await expect(movement).toContainText("0 movement points remained");await expect(movement).toContainText("Ball possession in the waiting snapshot remains unknown");
  const pickup=table.locator("tbody tr").filter({hasText:"pickup consumes no second movement point"});
  await expect(pickup).toHaveCount(1);await pickup.locator("summary").click();
  await expect(pickup).toContainText("successful Sure Hands replacement secured the ball there");await expect(pickup).toContainText("post-move budget stays at 0");
  await expect(pickup).toContainText("Earlier unknown possession is not changed");await expect(pickup).toContainText("failed-pickup alternatives remain unquantified");
  await expect(pickup).toContainText("88.9%");await expect(page.getByText("Context points: Not scored")).toHaveCount(2);
  await page.screenshot({path:"/tmp/nufflizier-zone-pickup-desktop.png",fullPage:true});
  await page.getByLabel("Scoring status").selectOption("bounded");await expect(table.locator("tbody tr").filter({has:page.locator("summary")})).toHaveCount(0);
  await page.getByRole("button",{name:"Reset filters",exact:true}).click();await expect(movement).toHaveCount(1);await expect(pickup).toHaveCount(1);
  await page.getByRole("button",{name:"Upload Another Replay"}).click();await expect(page.getByLabel("Scoring status")).toHaveCount(0);expect(errors).toEqual([]);
});

test("combined moves and failed turnovers retain separate dice and unknown tactical cost",async({page})=>{
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
  await page.goto("/nufflizier");await expect(page).toHaveTitle("Nufflizier");
  for(const c of [
    {id:"combined_team_rush",text:"confirmed combined step moved the player",chance:"66.7%"},
    {id:"combined_pickup_carrier",text:"confirmed combined step moved the player",chance:"83.3%"},
    {id:"combined_failure_move",text:"turnover and availability cost remain unquantified",chance:"66.7%"},
    {id:"combined_failure_blitz",text:"turnover and availability cost remain unquantified",chance:"16.7%"}
  ]) {
    const xml=lonerDriveXml(c.id,"tests/fixtures/evidence/bb3-combined-movement.json"),report=analyzeNufflizerInput(xml);
    await page.route("**/api/nufflizier/analyze",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(report)}));
    await page.setInputFiles('input[name="replay"]',{name:"source-combined.xml",mimeType:"application/xml",buffer:Buffer.from(xml)});
    await page.getByRole("button",{name:"Analyze Nuffle Luck"}).click();await expect(page.getByRole("heading",{name:"Nuffle Match Report"})).toBeVisible();
    const table=page.getByRole("table").filter({has:page.getByRole("columnheader",{name:"Replay segment"})});
    const row=table.locator("tbody tr").filter({hasText:c.text});await expect(row).toHaveCount(1);await row.locator("summary").click();
    await expect(row).toContainText(c.chance);
    if(c.id==="combined_team_rush") {await expect(row).toContainText("[8, 1] to [9, 2]");await expect(row).toContainText("omitted coordinates remain unknown");await expect(row).toContainText("No ordinary activation");}
    if(c.id==="combined_pickup_carrier") {await expect(row).toContainText("[17, 6] to [18, 7]");await expect(row).toContainText("explicitly held ball followed");}
    if(c.id.startsWith("combined_failure")){await expect(row).toContainText("player fell and the turn ended");await expect(row).toContainText(c.id.endsWith("blitz")?"scored damage: 0.15":"scored damage: -0.40");}
    await expect(page.getByText("Context points: Not scored")).toHaveCount(2);
    await page.screenshot({path:`/tmp/nufflizier-${c.id}-desktop.png`,fullPage:true});
    await page.getByLabel("Scoring status").selectOption("bounded");await expect(row).toHaveCount(0);
    await page.getByRole("button",{name:"Reset filters",exact:true}).click();await expect(row).toHaveCount(1);
    await page.getByRole("button",{name:"Upload Another Replay"}).click();await expect(page.getByLabel("Scoring status")).toHaveCount(0);
    await page.unroute("**/api/nufflizier/analyze");
  }
  expect(errors).toEqual([]);
});

test("committed team Dodge bounds keep terminal turn cost separate from compound dice", async ({page})=>{
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  page.on("console",message=>{if(message.type()==="error")errors.push(message.text());});
  await page.setViewportSize({width:1280,height:720});
  await page.goto("/nufflizier");await expect(page).toHaveTitle("Nufflizier");
  for(const [index,c] of [
    {id:"direct_team_dodge_failure",file:"tests/fixtures/evidence/bb3-terminal-team-dodge.json",range:"-2.67 to 0.00"},
    {id:"team_dodge_move",file:"tests/fixtures/evidence/bb3-team-reroll-movement.json",range:"0.00 to 1.33"}
  ].entries()) {
    const xml=lonerDriveXml(c.id,c.file),report=analyzeNufflizerInput(xml);
    // Presentation uses a validated source-fragment response. The separate
    // original-demo11 worker/API gate validates real execution at4s.
    await page.route("**/api/nufflizier/analyze",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(report)}));
    await page.setInputFiles('input[name="replay"]',{name:"source-terminal-team-dodge.xml",mimeType:"application/xml",buffer:Buffer.from(xml)});
    await page.getByRole("button",{name:"Analyze Nuffle Luck"}).click();
    await expect(page.getByRole("heading",{name:"Nuffle Match Report"})).toBeVisible();
    await expect(page.getByText(/Separate context ranges are available for 1 check/)).toBeVisible();
    await page.getByLabel("Scoring status").selectOption("bounded");
    const row=page.getByRole("table").locator("tbody tr").filter({has:page.locator("summary")});
    await expect(row).toHaveCount(1);await row.locator("summary").click();
    await expect(row).toContainText("team reroll already spent");
    await expect(row).toContainText("66.7% success");
    await expect(row).toContainText("0 to 4 other players");
    await expect(row).toContainText(c.range+" provisional context units");
    await expect(row).toContainText("later damage dice are outside");
    if(index===0)await page.screenshot({path:"/tmp/nufflizier-terminal-team-dodge-desktop.png",fullPage:true});
    const download=page.waitForEvent("download");await page.getByRole("button",{name:"Download JSON"}).click();
    const result=await download;const saved=JSON.parse(readFileSync((await result.path())!,"utf8"));
    expect(saved.schemaVersion).toBe("2.50");expect(saved.teams.every((t:{impactCount:number})=>t.impactCount===0)).toBe(true);
    expect(saved.events.find((e:{contextualBounds?:{policy:string}})=>e.contextualBounds?.policy==="team_reroll_terminal_moves").probabilitySuccess).toBeCloseTo(8/9,12);
    if(index===0)await page.getByRole("button",{name:"Upload Another Replay"}).click();
    await page.unroute("**/api/nufflizier/analyze");
  }
  expect(errors).toEqual([]);
});

test("current roster completion excludes a spent player from later Dodge opportunities",async({page})=>{
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
  const input=readFileSync("demo-replays/demo11.bbr","utf8"),report=analyzeNufflizerInput(input);
  await page.route("**/api/nufflizier/analyze",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(report)}));
  await page.setViewportSize({width:1280,height:720});await page.goto("/nufflizier");await expect(page).toHaveTitle("Nufflizier");
  await page.setInputFiles('input[name="replay"]',{name:"source11.bbr",mimeType:"application/octet-stream",buffer:Buffer.from(input)});
  await page.getByRole("button",{name:"Analyze Nuffle Luck"}).click();await expect(page.getByRole("heading",{name:"Nuffle Match Report"})).toBeVisible();
  await page.getByLabel("Player ID or initial roster name").fill("39");await page.getByLabel("Team turn",{exact:true}).fill("6");
  await page.getByLabel("Scoring status").selectOption("excluded");
  const table=page.getByRole("table").filter({has:page.getByRole("columnheader",{name:"Replay segment"})});
  const completed=table.locator("tbody tr").filter({hasText:"Player 46's ordinary Move activation ended"});
  await expect(completed).toHaveCount(1);await completed.locator("summary").click();
  await expect(completed).toContainText("Ownership was verified from the current roster checkpoint");
  await expect(completed).toContainText("Later move opportunities exclude this spent activation");
  await page.getByLabel("Scoring status").selectOption("bounded");
  const dodge=table.locator("tbody tr").filter({has:page.locator("summary")});await expect(dodge).toHaveCount(1);await dodge.locator("summary").click();
  await expect(dodge).toContainText("0 to 3 other players");await expect(dodge).toContainText("-2.00 to 0.00 provisional context units");
  await expect(dodge).toContainText("88.9%");await expect(dodge).toContainText("66.7% success");
  await page.getByText(/With the team reroll already spent/).scrollIntoViewIfNeeded();
  await page.screenshot({path:"/tmp/nufflizier-current-roster-move-desktop.png",fullPage:false});
  const download=page.waitForEvent("download");await page.getByRole("button",{name:"Download JSON"}).click();const file=await download;
  const saved=JSON.parse(readFileSync((await file.path())!,"utf8"));expect(saved.schemaVersion).toBe("2.50");
  expect(saved.events.find((e:{metadata:{sourceId:string}})=>e.metadata.sourceId==="source-1960").contextualBounds.maximumMoves).toBe(3);
  expect(saved.events.find((e:{metadata:{sourceId:string}})=>e.metadata.sourceId==="source-1942").metadata.initialRosterName).toBeUndefined();
  expect(saved.teams.every((t:{impactCount:number})=>t.impactCount===0)).toBe(true);
  await page.getByRole("button",{name:"Upload Another Replay"}).click();await expect(page.getByLabel("Scoring status")).toHaveCount(0);expect(errors).toEqual([]);
});

test("completed ordinary Moves stay spent across stable wait checkpoints",async({page})=>{
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
  const input=readFileSync("demo-replays/demo7.bbr","utf8"),report=analyzeNufflizerInput(input);
  await page.route("**/api/nufflizier/analyze",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(report)}));
  await page.setViewportSize({width:1280,height:720});await page.goto("/nufflizier");await expect(page).toHaveTitle("Nufflizier");
  await page.setInputFiles('input[name="replay"]',{name:"source7.bbr",mimeType:"application/octet-stream",buffer:Buffer.from(input)});
  await page.getByRole("button",{name:"Analyze Nuffle Luck"}).click();await expect(page.getByRole("heading",{name:"Nuffle Match Report"})).toBeVisible();
  await page.getByLabel("Player ID or initial roster name").fill("43");await page.getByLabel("Team turn",{exact:true}).fill("9");await page.getByLabel("Scoring status").selectOption("excluded");
  const table=page.getByRole("table").filter({has:page.getByRole("columnheader",{name:"Replay segment"})});
  const completion=table.locator("tbody tr").filter({hasText:"Player 40's ordinary Move activation ended"});await expect(completion).toHaveCount(1);await completion.locator("summary").click();
  await expect(completion).toContainText("completed position was confirmed by the following stable checkpoint");
  await expect(completion).toContainText("no dice were needed for this movement");
  await page.getByLabel("Player ID or initial roster name").fill("47");await page.getByLabel("Scoring status").selectOption("bounded");
  const row=table.locator("tbody tr").filter({has:page.locator("summary")});await expect(row).toHaveCount(1);await row.locator("summary").click();
  await expect(row).toContainText("2 earlier player activations had already ended");
  await expect(row).toContainText("0 to 3 other players");await expect(row).toContainText("0.00 to 0.50 context units");
  await expect(row).toContainText("97.2%");await expect(row).toContainText("83.3% success");
  await row.scrollIntoViewIfNeeded();await page.screenshot({path:"/tmp/nufflizier-deterministic-completion-desktop.png",fullPage:false});
  const download=page.waitForEvent("download");await page.getByRole("button",{name:"Download JSON"}).click();const file=await download;
  const saved=JSON.parse(readFileSync((await file.path())!,"utf8"));expect(saved.schemaVersion).toBe("2.50");
  expect(saved.events.find((e:{metadata:{sourceId:string}})=>e.metadata.sourceId==="source-3098").contextualBounds.maximumMoves).toBe(3);
  expect(saved.teams.every((t:{impactCount:number})=>t.impactCount===0)).toBe(true);
  await page.getByRole("button",{name:"Upload Another Replay"}).click();await expect(page.getByLabel("Scoring status")).toHaveCount(0);expect(errors).toEqual([]);
});

test("retained Catch explains the original die's fixed-policy failure range",async({page})=>{
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
  const input=readFileSync(DEMO,"utf8"),report=analyzeNufflizerInput(input);
  // Real original replay through domain/schema; the existing real-upload flow
  // separately covers the worker/API transport without mocking its response.
  await page.route("**/api/nufflizier/analyze",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(report)}));
  await page.setViewportSize({width:1280,height:720});await page.goto("/nufflizier");await expect(page).toHaveTitle("Nufflizier");
  await page.setInputFiles('input[name="replay"]',DEMO);await page.getByRole("button",{name:"Analyze Nuffle Luck"}).click();
  await expect(page.getByRole("heading",{name:"Nuffle Match Report"})).toBeVisible();
  await page.getByLabel("Player ID or initial roster name").fill("1");await page.getByLabel("Category",{exact:true}).selectOption("ball_handling");await page.getByLabel("Scoring status").selectOption("bounded");
  const table=page.getByRole("table").filter({has:page.getByRole("columnheader",{name:"Replay segment"})});
  const row=table.locator("tbody tr").filter({has:page.locator("summary")});await expect(row).toHaveCount(1);await row.locator("summary").click();
  await expect(row).toContainText("Before the original Catch die");await expect(row).toContainText("33.3% success");
  await expect(row).toContainText("-0.67 to 0 context units");await expect(row).toContainText("same die, not another random outcome");
  await expect(row).toContainText("No midpoint or endpoint enters point totals");
  await row.scrollIntoViewIfNeeded();await page.screenshot({path:"/tmp/nufflizier-retained-catch-desktop.png",fullPage:false});
  await page.setViewportSize({width:390,height:844});
  const moment=row.locator("td").nth(2);await moment.scrollIntoViewIfNeeded();
  expect((await moment.boundingBox())!.width).toBeGreaterThanOrEqual(256);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(row).toContainText("Holding the recorded decline-on-failure policy fixed");
  await page.screenshot({path:"/tmp/nufflizier-retained-catch-mobile.png",fullPage:false});
  const download=page.waitForEvent("download");await page.getByRole("button",{name:"Download JSON"}).click();const file=await download;
  const saved=JSON.parse(readFileSync((await file.path())!,"utf8"));expect(saved.schemaVersion).toBe("2.50");
  expect(saved.events.find((e:{metadata:{sourceId:string}})=>e.metadata.sourceId==="source-548").catchPossessionBounds).toMatchObject({policy:"kept_catch_failure_envelope",lower:-2/3,upper:0});
  expect(saved.teams.every((t:{impactCount:number})=>t.impactCount===0)).toBe(true);
  await page.getByRole("button",{name:"Upload Another Replay"}).click();await expect(page.getByLabel("Scoring status")).toHaveCount(0);expect(errors).toEqual([]);
});

test("crowd-pushed defenders retain one unscored injury and confirmed off-pitch state",async({page})=>{
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
  const input=readFileSync("demo-replays/demo11.bbr","utf8"),report=analyzeNufflizerInput(input);
  // Full original source + report contract; the existing demo11 worker/API
  // acceptance separately exercises real transport with the unchanged4s limit.
  await page.route("**/api/nufflizier/analyze",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(report)}));
  await page.setViewportSize({width:1280,height:800});await page.goto("/nufflizier");await expect(page).toHaveTitle("Nufflizier");
  await page.setInputFiles('input[name="replay"]',{name:"source11.bbr",mimeType:"application/octet-stream",buffer:Buffer.from(input)});
  await page.getByRole("button",{name:"Analyze Nuffle Luck"}).click();await expect(page.getByRole("heading",{name:"Nuffle Match Report"})).toBeVisible();
  await page.getByLabel("Player ID or initial roster name").fill("10");await page.getByLabel("Category",{exact:true}).selectOption("block");await page.getByLabel("Scoring status").selectOption("scored");
  const table=page.getByRole("table").filter({has:page.getByRole("columnheader",{name:"Replay segment"})});
  const row=table.locator("tbody tr").filter({hasText:"This block pushed defender 38"});await expect(row).toHaveCount(1);await row.locator("summary").click();
  await expect(row).toContainText("from [10,14] off pitch to [10,15]");
  await expect(row).toContainText("Two removal records are stages for that one player, not two injuries");
  await expect(row).toContainText("contains no armor roll");await expect(row).toContainText("1 damage roll has unknown odds");
  await expect(row).toContainText("Omitted posture remains unknown");await expect(row).toContainText("1 immediately linked damage step");
  await row.scrollIntoViewIfNeeded();await page.screenshot({path:"/tmp/nufflizier-block-crowd-desktop.png",fullPage:false});
  await page.setViewportSize({width:390,height:844});const moment=row.locator("td").nth(2);await moment.scrollIntoViewIfNeeded();
  expect((await moment.boundingBox())!.width).toBeGreaterThanOrEqual(256);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({path:"/tmp/nufflizier-block-crowd-mobile.png",fullPage:false});
  const download=page.waitForEvent("download");await page.getByRole("button",{name:"Download JSON"}).click();const file=await download;
  const saved=JSON.parse(readFileSync((await file.path())!,"utf8")),pool=saved.events.find((e:{metadata:{sourceId:string}})=>e.metadata.sourceId==="source-3716"),c=pool.metadata.blockCrowd;
  expect(saved.schemaVersion).toBe("2.50");expect(c.after).toMatchObject({checkpointAfter:3730,cell:{x:-1,y:-1},canAct:true,tackleZone:true,statusCode:null});
  expect(saved.damageSteps.find((s:{actionId:string})=>s.actionId===c.damageActionId)).toMatchObject({scoredRolls:0,unscoredRolls:1,diceContribution:0});
  expect(saved.teams.every((t:{impactCount:number})=>t.impactCount===0)).toBe(true);
  await page.getByRole("button",{name:"Upload Another Replay"}).click();await expect(page.getByLabel("Scoring status")).toHaveCount(0);expect(errors).toEqual([]);
});

test("recorded injury outcomes stay separate from unknown odds and unscored contributions",async({page})=>{
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
  const input=readFileSync("demo-replays/demo9.bbr","utf8"),report=analyzeNufflizerInput(input);
  await page.route("**/api/nufflizier/analyze",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(report)}));
  await page.setViewportSize({width:1280,height:800});await page.goto("/nufflizier");await expect(page).toHaveTitle("Nufflizier");
  await page.setInputFiles('input[name="replay"]',{name:"source9.bbr",mimeType:"application/octet-stream",buffer:Buffer.from(input)});await page.getByRole("button",{name:"Analyze Nuffle Luck"}).click();
  await expect(page.getByRole("heading",{name:"Nuffle Match Report"})).toBeVisible();
  await page.getByLabel("Player ID or initial roster name").fill("43");await page.getByLabel("Category",{exact:true}).selectOption("injury");await page.getByLabel("Scoring status").selectOption("excluded");
  const table=page.getByRole("table").filter({has:page.getByRole("columnheader",{name:"Replay segment"})});const row=table.locator("tbody tr").filter({hasText:"Source: source-3889;"});
  await expect(row).toHaveCount(1);await expect(row.locator("td").nth(3)).toHaveText("Unknown");await expect(row.locator("td").nth(4)).toHaveText("Casualty (recorded)");
  await expect(row.locator("td").nth(5)).toHaveText("Not scored");await row.locator("summary").click();
  await expect(row).toContainText("not a success or failure check");await expect(row).toContainText("does not establish final posture");
  await expect(row).toContainText("no luck contribution is assigned");
  await row.scrollIntoViewIfNeeded();await page.screenshot({path:"/tmp/nufflizier-injury-observation-desktop.png",fullPage:false});
  await page.getByLabel("Scoring status").selectOption("scored");await expect(row).toHaveCount(0);await page.getByLabel("Scoring status").selectOption("excluded");await row.locator("summary").click();
  await page.setViewportSize({width:390,height:844});await row.locator("td").nth(2).scrollIntoViewIfNeeded();
  await expect(row.getByText(/The recorded injury result for player 43/)).toBeVisible();expect((await row.locator("td").nth(2).boundingBox())!.width).toBeGreaterThanOrEqual(256);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);await page.screenshot({path:"/tmp/nufflizier-injury-observation-mobile.png",fullPage:false});
  const download=page.waitForEvent("download");await page.getByRole("button",{name:"Download JSON"}).click();const file=await download;const saved=JSON.parse(readFileSync((await file.path())!,"utf8"));
  const e=saved.events.find((e:{metadata:{sourceId:string}})=>e.metadata.sourceId==="source-3889");expect(saved.schemaVersion).toBe("2.50");expect(e.metadata.injuryObservation).toMatchObject({outcome:"casualty",recordKind:"direct",subjectId:"43",subjectTeamId:"1",sourceCode:1,damageStepSourceIndex:3886});
  expect(e.scoringStatus).toBe("excluded");expect(e.probabilitySuccess).toBeNull();expect(e.actualSuccess).toBeNull();expect(e.weightedDelta).toBe(0);
  expect(saved.teams.every((t:{impactCount:number})=>t.impactCount===0)).toBe(true);await page.getByRole("button",{name:"Upload Another Replay"}).click();await expect(page.getByLabel("Scoring status")).toHaveCount(0);expect(errors).toEqual([]);
});

test("partial context sums reconcile while points and whole-match verdict remain abstained", async ({
  page
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  const input = readFileSync("demo-replays/demo11.bbr", "utf8"),
    report = analyzeNufflizerInput(input);
  // Full source through domain/schema; original demo11 worker/API assertions
  // separately check real transport and the unchanged four-second budget.
  await page.route("**/api/nufflizier/analyze", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(report)
    })
  );
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/nufflizier");
  await expect(page).toHaveTitle("Nufflizier");
  await page.setInputFiles('input[name="replay"]', {
    name: "source11.bbr",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(input)
  });
  await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
  await expect(
    page.getByRole("heading", { name: "Nuffle Match Report" })
  ).toBeVisible();
  const card = page
    .getByRole("article")
    .filter({
      has: page.getByRole("heading", {
        name: report.teams[1].teamName,
        exact: true
      })
    });
  await expect(card.getByText("Context points: Not scored")).toBeVisible();
  await expect(
    card.getByText(
      "Partial component sum: -4.67 to 4.00 provisional context units across 4 reported components"
    )
  ).toBeVisible();
  await expect(
    page.getByText(/They do not rank the teams or bound whole-match luck/)
  ).toBeVisible();
  await card.getByText("Partial component breakdown", { exact: true }).click();
  await expect(
    card.getByText(/not a whole-match luck range, a confidence interval/)
  ).toBeVisible();
  await expect(card.locator("li")).toHaveText([
    "dodge: -4.67 to 4.00 provisional context units across 4 reported components"
  ]);
  await page.getByLabel("Scoring status").selectOption("bounded");
  await page.getByLabel("Category", { exact: true }).selectOption("dodge");
  const table = page
    .getByRole("table")
    .filter({
      has: page.getByRole("columnheader", { name: "Replay segment" })
    });
  await expect(table.locator("tbody tr")).toHaveCount(4);
  await expect(card.getByText(/Partial component sum: -4.67/)).toBeVisible();
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "/tmp/nufflizier-context-components-desktop.png",
    fullPage: false
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await card.scrollIntoViewIfNeeded();
  await expect(
    card.getByText(/not a whole-match luck range, a confidence interval/)
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "/tmp/nufflizier-context-components-mobile.png",
    fullPage: false
  });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).click();
  const file = await download;
  const saved = JSON.parse(readFileSync((await file.path())!, "utf8"));
  expect(saved.contextComponents).toEqual(report.contextComponents);
  expect(
    saved.teams.every((t: { impactCount: number }) => t.impactCount === 0)
  ).toBe(true);
  expect(saved.verdict.luckierTeam).toBe("unknown");
  await page.getByRole("button", { name: "Upload Another Replay" }).click();
  await expect(page.getByText("Partial component breakdown")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("committed Rush ranges separate conditional chance from compound dice and point scores", async ({
  page
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  const input = readFileSync("demo-replays/demo2.bbr", "utf8"),
    report = analyzeNufflizerInput(input);
  // Original file/domain/schema; the existing demo2 worker/API gate separately
  // verifies transport and both new components with the real four-second cap.
  await page.route("**/api/nufflizier/analyze", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(report)
    })
  );
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/nufflizier");
  await expect(page).toHaveTitle("Nufflizier");
  await page.setInputFiles('input[name="replay"]', {
    name: "source2.bbr",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(input)
  });
  await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
  await expect(
    page.getByRole("heading", { name: "Nuffle Match Report" })
  ).toBeVisible();
  const card = page
    .getByRole("article")
    .filter({
      has: page.getByRole("heading", {
        name: report.teams[1].teamName,
        exact: true
      })
    });
  await expect(card.getByText("Context points: Not scored")).toBeVisible();
  await expect(
    card.getByText(
      "Partial component sum: -12.83 to 1.83 provisional context units across 4 reported components"
    )
  ).toBeVisible();
  await card.getByText("Partial component breakdown", { exact: true }).click();
  await expect(card.locator("li")).toContainText(["dodge: -5.33 to 0.00", "movement risk: -7.50 to 1.83"]);
  await page.getByLabel("Scoring status").selectOption("bounded");
  await page
    .getByLabel("Category", { exact: true })
    .selectOption("movement_risk");
  const table = page
    .getByRole("table")
    .filter({
      has: page.getByRole("columnheader", { name: "Replay segment" })
    });
  await expect(table.locator("tbody tr")).toHaveCount(3);
  await page.getByLabel("Player ID or initial roster name").fill("39");
  await page.getByLabel("Team turn", { exact: true }).fill("2");
  const row = table.locator("tbody tr");
  await expect(row).toHaveCount(1);
  await row.locator("summary").click();
  await expect(row).toContainText("replacement Rush die had 83.3% success");
  await expect(row).toContainText("97.2%");
  await expect(row).toContainText("0 to 5 other players");
  await expect(row).toContainText("0.00 to 0.83 provisional context units");
  await expect(row).toContainText("earlier failed die");
  await expect(row).toContainText("later damage dice are outside");
  await expect(row).toContainText(
    "No midpoint or endpoint enters point totals"
  );
  await row.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "/tmp/nufflizier-terminal-rush-desktop.png",
    fullPage: false
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await row.locator("td").nth(2).scrollIntoViewIfNeeded();
  await expect(
    row.getByText(/With the team reroll already spent/)
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "/tmp/nufflizier-terminal-rush-mobile.png",
    fullPage: false
  });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).click();
  const file = await download;
  const saved = JSON.parse(readFileSync((await file.path())!, "utf8"));
  expect(saved.schemaVersion).toBe("2.50");
  expect(saved.contextModelVersion).toBe("mobility-possession-38");
  expect(
    saved.events.filter(
      (e: { contextualBounds?: { policy: string } }) =>
        e.contextualBounds?.policy === "team_reroll_rush_moves"
    )
  ).toHaveLength(2);
  expect(
    saved.teams.every((t: { impactCount: number }) => t.impactCount === 0)
  ).toBe(true);
  expect(saved.verdict.luckierTeam).toBe("unknown");
  await page.getByRole("button", { name: "Upload Another Replay" }).click();
  await expect(page.getByLabel("Scoring status")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("retained Rush failure prices only the original die's fixed-decline teammate component", async ({
  page
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  const input = readFileSync("demo-replays/demo2.bbr", "utf8"),
    report = analyzeNufflizerInput(input);
  // Actual original-file worker transport is covered by the existing demo2
  // API acceptance; this checks the validated report's rendered interpretation.
  await page.route("**/api/nufflizier/analyze", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(report)
    })
  );
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/nufflizier");
  await expect(page).toHaveTitle("Nufflizier");
  await page.setInputFiles('input[name="replay"]', {
    name: "source2.bbr",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(input)
  });
  await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
  await expect(
    page.getByRole("heading", { name: "Nuffle Match Report" })
  ).toBeVisible();
  const card = page
    .getByRole("article")
    .filter({
      has: page.getByRole("heading", {
        name: report.teams[1].teamName,
        exact: true
      })
    });
  await expect(card.getByText("Context points: Not scored")).toBeVisible();
  await expect(
    card.getByText(
      "Partial component sum: -12.83 to 1.83 provisional context units across 4 reported components"
    )
  ).toBeVisible();
  await page
    .getByLabel("Category", { exact: true })
    .selectOption("movement_risk");
  await page.getByLabel("Scoring status").selectOption("bounded");
  await page.getByLabel("Player ID or initial roster name").fill("46");
  await page.getByLabel("Team turn", { exact: true }).fill("9");
  const table = page
      .getByRole("table")
      .filter({
        has: page.getByRole("columnheader", { name: "Replay segment" })
      }),
    row = table.locator("tbody tr");
  await expect(row).toHaveCount(1);
  await row.locator("summary").click();
  await expect(row).toContainText("Before the original Rush die");
  await expect(row).toContainText("decline-on-failure policy fixed");
  await expect(row).toContainText("0 to 9 possible other ordinary moves");
  await expect(row).toContainText("83.3%");
  await expect(row).toContainText("from [16,9] to [15,9]");
  await expect(row).toContainText("attempt toward [14,9]");
  await expect(row).toContainText("not a new random draw");
  await expect(row).toContainText("-7.50 to 0.00 provisional context units");
  await expect(row).toContainText("Damage rolls without verified odds: 1.");
  await row.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "/tmp/nufflizier-kept-rush-desktop.png",
    fullPage: false
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await row.locator("td").nth(2).scrollIntoViewIfNeeded();
  await expect(row.getByText(/Before the original Rush die/)).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "/tmp/nufflizier-kept-rush-mobile.png",
    fullPage: false
  });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).click();
  const file = await download;
  const saved = JSON.parse(readFileSync((await file.path())!, "utf8"));
  expect(saved.schemaVersion).toBe("2.50");
  expect(saved.contextModelVersion).toBe("mobility-possession-38");
  const e = saved.events.find(
    (e: { metadata: { sourceId: string } }) =>
      e.metadata.sourceId === "source-2704"
  );
  expect(e.metadata.retainedRushContext.waitingCheckpointAfter).toBe(2700);
  expect(e.metadata.teamRerollsSpent).toBe(0);
  expect(e.probabilitySuccess).toBe(5 / 6);
  expect(e.contextualBounds).toMatchObject({
    policy: "kept_rush_terminal_moves",
    lower: -15 / 2,
    upper: 0
  });
  expect(
    saved.teams.every((t: { impactCount: number }) => t.impactCount === 0)
  ).toBe(true);
  expect(saved.verdict.luckierTeam).toBe("unknown");
  await page.getByRole("button", { name: "Upload Another Replay" }).click();
  await expect(page.getByLabel("Scoring status")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("retained Dodge reports the original fixed-decline envelope on desktop and mobile", async ({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
 const input=readFileSync("demo-replays/demo2.bbr","utf8"),report=analyzeNufflizerInput(input);
 // The existing ten-request worker acceptance covers demo2 transport. This
 // rendered flow consumes that same schema-validated original-source report.
 await page.route("**/api/nufflizier/analyze",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(report)}));
 await page.setViewportSize({width:1280,height:800});await page.goto("/nufflizier");
 await page.setInputFiles('input[name="replay"]',{name:"source.bbr",mimeType:"application/octet-stream",buffer:Buffer.from(input)});
 await page.getByRole("button",{name:"Analyze Nuffle Luck"}).click();await expect(page.getByRole("heading",{name:"Nuffle Match Report"})).toBeVisible();
 const card=page.getByRole("article").filter({has:page.getByRole("heading",{name:report.teams[1].teamName,exact:true})});
 await expect(card.getByText("Context points: Not scored")).toBeVisible();await expect(card.getByText("Partial component sum: -12.83 to 1.83 provisional context units across 4 reported components")).toBeVisible();
 await page.getByLabel("Category",{exact:true}).selectOption("dodge");await page.getByLabel("Scoring status").selectOption("bounded");await page.getByLabel("Player ID or initial roster name").fill("42");await page.getByLabel("Team turn",{exact:true}).fill("13");
 const table=page.getByRole("table").filter({has:page.getByRole("columnheader",{name:"Replay segment"})}),row=table.locator("tbody tr");
 await expect(row).toHaveCount(1);await row.locator("summary").click();
 await expect(row).toContainText("Before the original Dodge die");await expect(row).toContainText("66.7%");await expect(row).toContainText("0 to 8 possible other ordinary moves");await expect(row).toContainText("-5.33 to 0.00 provisional context units");await expect(row).toContainText("no team reroll was spent");await expect(row).toContainText("No midpoint");
 await row.scrollIntoViewIfNeeded();await page.screenshot({path:"/tmp/nufflizier-kept-dodge-desktop.png",fullPage:false});
 await page.setViewportSize({width:390,height:844});await row.locator("td").nth(2).scrollIntoViewIfNeeded();await expect(row.getByText(/Before the original Dodge die/)).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);await page.screenshot({path:"/tmp/nufflizier-kept-dodge-mobile.png",fullPage:false});
 const download=page.waitForEvent("download");await page.getByRole("button",{name:"Download JSON"}).click();const file=await download;const saved=JSON.parse(readFileSync((await file.path())!,"utf8"));
 expect(saved.schemaVersion).toBe("2.50");expect(saved.contextModelVersion).toBe("mobility-possession-38");const e=saved.events.find((e:{metadata:{sourceId:string}})=>e.metadata.sourceId==="source-3775");
 expect(e.metadata.preRoll.actorStandUpSourceIndex).toBe(3769);expect(e.metadata.teamRerollsSpent).toBe(0);expect(e.probabilitySuccess).toBe(2/3);expect(e.contextualBounds).toMatchObject({policy:"kept_dodge_terminal_moves",lower:-16/3,upper:0,maximumMoves:8});expect(saved.teams.every((t:{impactCount:number})=>t.impactCount===0)).toBe(true);expect(saved.verdict.luckierTeam).toBe("unknown");
 await page.getByRole("button",{name:"Upload Another Replay"}).click();await expect(page.getByLabel("Scoring status")).toHaveCount(0);expect(errors).toEqual([]);
});

test("continued traits explain a separate fixed-policy block model without changing totals", async ({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
 const input=readFileSync("demo-replays/demo5.bbr","utf8"),report=analyzeNufflizerInput(input);
 // The existing original-demo5 worker/API case exercises transport. The UI
 // consumes the same validated original-source report without an eleventh
 // admission to the isolated ten-request upload quota.
 await page.route("**/api/nufflizier/analyze",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(report)}));
 await page.setViewportSize({width:1280,height:800});await page.goto("/nufflizier");
 await page.setInputFiles('input[name="replay"]',{name:"source.bbr",mimeType:"application/octet-stream",buffer:Buffer.from(input)});
 await page.getByRole("button",{name:"Analyze Nuffle Luck"}).click();await expect(page.getByRole("heading",{name:"Nuffle Match Report"})).toBeVisible();
 await page.getByLabel("Category",{exact:true}).selectOption("block");await page.getByLabel("Player ID or initial roster name").fill("2");
 const table=page.getByRole("table").filter({has:page.getByRole("columnheader",{name:"Replay segment"})}),row=table.locator("tbody tr").filter({hasText:"Intrinsic skill evidence for attacker 2 and defender 46"});
 await expect(row).toHaveCount(1);await row.locator("summary").click();
 await expect(row).toContainText("continues from checkpoints 0/0");await expect(row).toContainText("Continued intrinsic block skills: attacker none; defender none");await expect(row).toContainText("Single-pool model");await expect(row).toContainText("chance of a positive knockdown balance is 55.6%");await expect(row).toContainText("expected balance is 0.528");await expect(row).toContainText("not the coach's actual choice or tactical impact");await expect(row).toContainText("not added to dice or context totals");
 await row.scrollIntoViewIfNeeded();await page.screenshot({path:"/tmp/nufflizier-block-traits-desktop.png",fullPage:false});
 await page.setViewportSize({width:390,height:844});await row.locator("td").nth(2).scrollIntoViewIfNeeded();await expect(row.getByText(/Single-pool model/)).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);await page.screenshot({path:"/tmp/nufflizier-block-traits-mobile.png",fullPage:false});
 const download=page.waitForEvent("download");await page.getByRole("button",{name:"Download JSON"}).click();const file=await download,saved=JSON.parse(readFileSync((await file.path())!,"utf8"));
 expect(saved.schemaVersion).toBe("2.50");expect(saved.modelVersion).toBe("dice-only-25");const e=saved.events.find((e:{metadata:{sourceId:string}})=>e.metadata.sourceId==="source-98");expect(e.metadata.block.skillModel.wrestlePolicy).toBe("improve_knockdown_balance");expect(e.metadata.block.skillModel.expectedValue).toBeCloseTo(19/36,12);expect(e.weightedDelta).toBeCloseTo(1/3,12);expect(saved.teams.every((t:{impactCount:number})=>t.impactCount===0)).toBe(true);expect(saved.verdict.luckierTeam).toBe("unknown");
 await page.getByRole("button",{name:"Upload Another Replay"}).click();await expect(page.getByLabel("Scoring status")).toHaveCount(0);expect(errors).toEqual([]);
});

test("dice census exposes nested draws and same-face star rerolls without inventing odds",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
 const input=readFileSync("demo-replays/demo7.bbr","utf8"),report=analyzeNufflizerInput(input);
 // The existing demo7 real-worker POST verifies transport at the unchanged
 // ten-request admission cap; this flow verifies the validated report display.
 await page.route("**/api/nufflizier/analyze",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(report)}));
 await page.setViewportSize({width:1280,height:800});await page.goto("/nufflizier");await expect(page).toHaveTitle(/Nufflizier/);
 await page.setInputFiles('input[name="replay"]',{name:"source7.bbr",mimeType:"application/octet-stream",buffer:Buffer.from(input)});await page.getByRole("button",{name:"Analyze Nuffle Luck"}).click();await expect(page.getByRole("heading",{name:"Nuffle Match Report"})).toBeVisible();
 await expect(page.getByText(/Dice-field coverage:/)).toContainText("478 event fields");await expect(page.getByText(/Dice-field coverage:/)).toContainText("1264 snapshot fields");await expect(page.getByText(/Dice-field coverage:/)).toContainText("not individual dice");
 await page.getByLabel("Scoring status").selectOption("excluded");
 const table=page.getByRole("table").filter({has:page.getByRole("columnheader",{name:"Replay segment"})});const fans=table.locator("tbody tr").filter({hasText:"Recorded fan-factor dice"});await expect(fans).toHaveCount(2);await fans.first().locator("summary").click();await expect(fans.first()).toContainText("HomeRoll.Dice");await expect(fans.first()).toContainText("Actual success and luck remain unknown");await expect(fans.first()).toContainText("Not scored");
 await page.getByLabel("Player ID or initial roster name").fill("49");const row=table.locator("tbody tr").filter({hasText:"original die 6, used; replacement die 6"});
 for(let i=0;i<5 && await row.count()===0;i++)await page.getByRole("button",{name:"Next page",exact:true}).click();
 await expect(row).toHaveCount(1);await row.locator("summary").click();await expect(row).toContainText("new draw even if its face matches");await expect(row).toContainText("not reroll eligibility, success odds or tactical value");await expect(row).toContainText("No luck score is added");await expect(row).toContainText("Not scored");await row.scrollIntoViewIfNeeded();await page.screenshot({path:"/tmp/nufflizier-dice-census-desktop.png",fullPage:false});
 await page.setViewportSize({width:390,height:844});await row.locator("td").nth(2).scrollIntoViewIfNeeded();await expect(row.getByText(/Recorded star reroll:/)).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);await page.screenshot({path:"/tmp/nufflizier-dice-census-mobile.png",fullPage:false});
 const pending=page.waitForEvent("download");await page.getByRole("button",{name:"Download JSON"}).click();const download=await pending,saved=JSON.parse(readFileSync((await download.path())!,"utf8"));expect(saved.coverage.modelVersion).toBe("dice-evidence-2");expect(saved.diceRecords.filter((d:{parentKind:string})=>d.parentKind==="event")).toHaveLength(478);const final=saved.diceRecords.find((d:{parentSourceId:string})=>d.parentSourceId==="source-4802");expect(final.disposition).toBe("unscored_roll");expect(final.aliasOf).toBeUndefined();expect(saved.verdict.luckierTeam).toBe("unknown");expect(saved.teams.every((t:{impactCount:number})=>t.impactCount===0)).toBe(true);
 await page.getByRole("button",{name:"Upload Another Replay"}).click();await expect(page.getByText(/Dice-field coverage:/)).toHaveCount(0);expect(errors).toEqual([]);
});

test("unknown snapshot dice prevent false full-support coverage on desktop and mobile",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
 const hidden=Array.from({length:100},(_,i)=>`<Unknown${i}><Dice><Die><DieType>0</DieType><Value>3</Value></Die></Dice></Unknown${i}>`).join("");
 const input=envelope(`<ReplayStep>${sequence([rollXml(7,6,2)])}<BoardState>${hidden}</BoardState></ReplayStep>`),report=analyzeNufflizerInput(input);
 // The existing diagnostic real-worker POST verifies this adversarial input;
 // presentation consumes its validated service report without another quota admission.
 await page.route("**/api/nufflizier/analyze",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(report)}));
 await page.setViewportSize({width:1280,height:800});await page.goto("/nufflizier");await expect(page).toHaveTitle(/Nufflizier/);
 await page.setInputFiles('input[name="replay"]',{name:"snapshot-coverage.xml",mimeType:"application/xml",buffer:Buffer.from(input)});await page.getByRole("button",{name:"Analyze Nuffle Luck"}).click();await expect(page.getByRole("heading",{name:"Nuffle Match Report"})).toBeVisible();
 await expect(page.locator("p").filter({hasText:/^Roll-candidate coverage:/})).toContainText("1.0%");await expect(page.locator("p").filter({hasText:/^Roll-candidate coverage:/})).toContainText("1 scored, 100 excluded");await expect(page.getByText(/Dice-field coverage:/)).toContainText("100 snapshot fields");await expect(page.getByText(/Dice-field coverage:/)).toContainText("100 with unresolved identity");
 await page.getByLabel("Scoring status").selectOption("excluded");
 const table=page.getByRole("table").filter({has:page.getByRole("columnheader",{name:"Replay segment"})}),row=table.locator("tbody tr").filter({hasText:"Unknown0.Dice"});await expect(row).toHaveCount(1);await row.locator("summary").click();await expect(row).toContainText("whether this is a new outcome or a copy remains unresolved");await expect(row).toContainText("Actual success and luck remain unknown");await expect(row).toContainText("Not scored");await row.scrollIntoViewIfNeeded();await page.screenshot({path:"/tmp/nufflizier-unknown-snapshot-desktop.png",fullPage:false});
 await page.setViewportSize({width:390,height:844});await row.locator("td").nth(2).scrollIntoViewIfNeeded();await expect(row.getByText(/Recorded dice field Unknown0.Dice:/)).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);await page.screenshot({path:"/tmp/nufflizier-unknown-snapshot-mobile.png",fullPage:false});
 const pending=page.waitForEvent("download");await page.getByRole("button",{name:"Download JSON"}).click();const download=await pending,saved=JSON.parse(readFileSync((await download.path())!,"utf8"));expect(saved.schemaVersion).toBe("2.50");expect(saved.coverage.rollCandidates.scoredRate).toBe(1/101);expect(saved.diceRecords).toHaveLength(101);expect(saved.verdict.luckierTeam).toBe("unknown");expect(saved.teams.every((t:{impactCount:number})=>t.impactCount===0)).toBe(true);
 await page.getByRole("button",{name:"Upload Another Replay"}).click();await expect(page.getByText(/Dice-field coverage:/)).toHaveCount(0);expect(errors).toEqual([]);
});

test("categorical injury luck scores the initial table while treatment and availability remain separate", async ({ page }) => {
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
  const input=readFileSync("demo-replays/demo8.bbr","utf8"),report=analyzeNufflizerInput(input);
  // Original demo5's existing API case separately exercises the real worker
  // transport for this same conditional table contract without an 11th POST.
  await page.route("**/api/nufflizier/analyze",r=>r.fulfill({status:200,contentType:"application/json",body:JSON.stringify(report)}));
  await page.setViewportSize({width:1280,height:800});await page.goto("/nufflizier");
  await expect(page).toHaveTitle("Nufflizier");
  await page.setInputFiles('input[name="replay"]',{name:"source8.bbr",mimeType:"application/octet-stream",buffer:Buffer.from(input)});
  await page.getByRole("button",{name:"Analyze Nuffle Luck"}).click();
  await expect(page.getByRole("heading",{name:"Nuffle Match Report"})).toBeVisible();
  await page.getByLabel("Player ID or initial roster name").fill("9");
  await page.getByLabel("Category",{exact:true}).selectOption("injury");
  await page.getByLabel("Scoring status").selectOption("scored");
  const row=page.locator("tbody tr").filter({hasText:"Source: source-249;"});
  await expect(row).toHaveCount(1);
  await expect(row.locator("td").nth(3)).toHaveText("Categorical");
  await expect(row.locator("td").nth(4)).toHaveText("Stunned (recorded)");
  await expect(row.locator("td").nth(5)).toHaveText("0.875");
  await row.locator("summary").click();
  await expect(row).toContainText("Conditional unmodified injury table for player 9: Stunty");
  await expect(row).toContainText("Stunned 15/36 (41.7%), KO 11/36 (30.6%), Badly Hurt 4/36 (11.1%), Casualty 6/36 (16.7%)");
  await expect(row).toContainText("before treatment or recovery");
  await expect(row).toContainText("Positive favors the injured player");
  await expect(row).toContainText("Treatment, recovery and match impact remain separate");
  await row.scrollIntoViewIfNeeded();await page.screenshot({path:"/tmp/nufflizier-categorical-injury-desktop.png",fullPage:false});
  await page.getByLabel("Scoring status").selectOption("excluded");await expect(row).toHaveCount(0);
  await page.getByLabel("Scoring status").selectOption("scored");await row.locator("summary").click();
  await page.setViewportSize({width:390,height:844});await row.locator("td").nth(2).scrollIntoViewIfNeeded();
  await expect(row.getByText(/Conditional unmodified injury table/)).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({path:"/tmp/nufflizier-categorical-injury-mobile.png",fullPage:false});
  const pending=page.waitForEvent("download");await page.getByRole("button",{name:"Download JSON"}).click();
  const file=await pending,saved=JSON.parse(readFileSync((await file.path())!,"utf8"));
  const e=saved.events.find((e:{metadata:{sourceId:string}})=>e.metadata.sourceId==="source-249");
  expect(saved.schemaVersion).toBe("2.50");expect(e.metadata.injuryTable).toMatchObject({stunty:true,thickSkull:false,counts:[15,11,4,6]});
  expect(e.probabilitySuccess).toBeNull();expect(e.actualSuccess).toBeNull();expect(e.weightedDelta).toBe(0.875);expect(e.metadata.injuryScoring.cause).toMatchObject({kind:"self_fall",rollSourceId:"source-244"});
  expect(saved.verdict.luckierTeam).toBe("unknown");expect(saved.teams.every((t:{impactCount:number})=>t.impactCount===0)).toBe(true);
  expect(await page.locator("nextjs-portal").count()).toBe(0);
  await page.getByRole("button",{name:"Upload Another Replay"}).click();
  await expect(page.getByLabel("Scoring status")).toHaveCount(0);expect(errors).toEqual([]);
});


test("completed Blocks explain spent activations while missing physical state remains unknown",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
 const report=analyzeNufflizerInput(readFileSync("demo-replays/demo10.bbr","utf8"));
 await page.route("**/api/nufflizier/analyze",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(report)}));
 await page.setViewportSize({width:1280,height:800});await page.goto("/nufflizier");expect(page.url()).toBe("http://127.0.0.1:3000/nufflizier");await expect(page).toHaveTitle(/Nufflizier/);
 await page.setInputFiles('input[name="replay"]',path.resolve("demo-replays/demo10.bbr"));await page.getByRole("button",{name:"Analyze Nuffle Luck"}).click();await expect(page.getByRole("heading",{name:"Nuffle Match Report"})).toBeVisible();
 await page.getByLabel("Player ID or initial roster name").fill("45");await page.getByLabel("Scoring status").selectOption("excluded");
 const ended=page.locator("tbody tr").filter({hasText:"Source: source-710;"});await expect(ended).toHaveCount(1);await ended.locator("summary").click();
 await expect(ended).toContainText("Player 38's ordinary Block activation ended");await expect(ended).toContainText("position and tackle zone are preserved");await expect(ended).toContainText("no dice roll or extra luck score");await ended.scrollIntoViewIfNeeded();await page.screenshot({path:"/tmp/nufflizier-block-completion-desktop.png"});
 await page.setViewportSize({width:390,height:844});await page.getByLabel("Scoring status").selectOption("scored");
 const roll=page.locator("tbody tr").filter({hasText:"Source: source-712;"});await expect(roll).toHaveCount(1);await roll.locator("summary").click();await expect(roll).toContainText("1 earlier player activation had already ended");await roll.locator("td").nth(2).scrollIntoViewIfNeeded();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);await page.screenshot({path:"/tmp/nufflizier-block-completion-mobile.png"});
 const pending=page.waitForEvent("download");await page.getByRole("button",{name:"Download JSON"}).click();const saved=JSON.parse(readFileSync((await (await pending).path())!,"utf8"));
 expect(saved.schemaVersion).toBe("2.50");expect(saved.contextModelVersion).toBe("mobility-possession-38");
 const initialInjury=saved.events.find((e:{metadata:{sourceId:string}})=>e.metadata.sourceId==="source-128");
 expect(initialInjury.metadata.injuryScoring.cause).toMatchObject({kind:"block",poolSourceId:"source-122",appliedOutcomeSourceId:"source-125",damageStepSourceIndex:126});
 const e=saved.events.find((e:{metadata:{sourceId:string}})=>e.metadata.sourceId==="source-710"),d=saved.events.find((e:{metadata:{sourceId:string}})=>e.metadata.sourceId==="source-712");
 expect(e.metadata.activationEnd).toMatchObject({actorId:"38",followingPlayerId:"45",periodCode:null,teamTurn:4});expect(d.metadata.preRoll.period).toBeNull();expect(d.metadata.preRoll.otherUsefulActivations).toBeNull();expect(d.metadata.preRoll.ordinaryMoveAvailability.unknownPlayerIds).not.toContain("38");expect(saved.teams.every((t:{impactCount:number})=>t.impactCount===0)).toBe(true);expect(saved.verdict.luckierTeam).toBe("unknown");
 expect(await page.locator("nextjs-portal").count()).toBe(0);await page.getByRole("button",{name:"Upload Another Replay"}).click();await expect(page.getByLabel("Scoring status")).toHaveCount(0);expect(errors).toEqual([]);
});

test("Mighty Blow armor commitment explains the remaining injury policy without scoring the choice", async ({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
 const input=readFileSync("demo-replays/demo10.bbr","utf8"),report=analyzeNufflizerInput(input);
 await page.route("**/api/nufflizier/analyze",r=>r.fulfill({status:200,contentType:"application/json",body:JSON.stringify(report)}));
 await page.setViewportSize({width:1280,height:800});await page.goto("/nufflizier");await expect(page).toHaveTitle("Nufflizier");
 await page.setInputFiles('input[name="replay"]',{name:"source10.bbr",mimeType:"application/octet-stream",buffer:Buffer.from(input)});await page.getByRole("button",{name:"Analyze Nuffle Luck"}).click();
 await expect(page.getByRole("heading",{name:"Nuffle Match Report"})).toBeVisible();
 await page.getByLabel("Player ID or initial roster name").fill("39");await page.getByLabel("Category",{exact:true}).selectOption("injury");await page.getByLabel("Scoring status").selectOption("scored");
 const row=page.locator("tbody tr").filter({hasText:"Source: source-113;"});await expect(row).toHaveCount(1);await expect(row.locator("td").nth(3)).toHaveText("Categorical");await expect(row.locator("td").nth(4)).toHaveText("KO (recorded)");await expect(row.locator("td").nth(5)).toHaveText("-0.625");
 await row.locator("summary").click();await expect(row).toContainText("Mighty Blow's +1 was already spent");await expect(row).toContainText("recorded use source-111");await expect(row).toContainText("none remains for this injury");await expect(row).toContainText("earlier post-roll armor choice has no scored probability");await expect(row).toContainText("does not consume the skill for a different Block");await expect(row).toContainText("Stunned 21/36");
 await row.scrollIntoViewIfNeeded();await page.screenshot({path:"/tmp/nufflizier-armor-budget-desktop.png"});
 await page.setViewportSize({width:390,height:844});await row.locator("td").nth(2).scrollIntoViewIfNeeded();await expect(row.getByText(/Mighty Blow's/)).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);await page.screenshot({path:"/tmp/nufflizier-armor-budget-mobile.png"});
 await page.getByLabel("Category",{exact:true}).selectOption("armor_break");await page.getByLabel("Scoring status").selectOption("excluded");const armor=page.locator("tbody tr").filter({hasText:"Source: source-112;"});await expect(armor).toHaveCount(1);await expect(armor.locator("td").nth(3)).toHaveText("Unknown");await expect(armor.locator("td").nth(5)).toHaveText("Not scored");
 await page.getByLabel("Player ID or initial roster name").fill("1");await page.getByLabel("Category",{exact:true}).selectOption("all");const use=page.locator("tbody tr").filter({hasText:"Source: source-111;"});await expect(use).toHaveCount(1);await expect(use).toContainText("Recorded Mighty Blow on armor");
 const pending=page.waitForEvent("download");await page.getByRole("button",{name:"Download JSON"}).click();const saved=JSON.parse(readFileSync((await (await pending).path())!,"utf8"));expect(saved.schemaVersion).toBe("2.50");expect(saved.modelVersion).toBe("dice-only-25");
 const e=saved.events.find((e:{metadata:{sourceId:string}})=>e.metadata.sourceId==="source-113"),u=saved.events.find((e:{metadata:{sourceId:string}})=>e.metadata.sourceId==="source-111");expect(e.metadata.injuryScoring.cause.armorModifierBudget).toEqual({useSourceId:"source-111",available:1,spent:1,remaining:0});expect(u.playerId).toBe("1");expect(u.metadata.armorModifierUse.subjectId).toBe("39");expect(e.probabilitySuccess).toBeNull();expect(saved.verdict.luckierTeam).toBe("unknown");
 expect(await page.locator("nextjs-portal").count()).toBe(0);await page.getByRole("button",{name:"Upload Another Replay"}).click();await expect(page.getByLabel("Scoring status")).toHaveCount(0);expect(errors).toEqual([]);
});
