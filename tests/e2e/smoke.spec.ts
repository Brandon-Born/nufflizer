import { test, expect } from "@playwright/test";
import path from "node:path";
import { readFileSync } from "node:fs";
import { contextReplayXml } from "../helpers/contextReplay";

const DEMO = path.resolve("demo-replays/demo1.bbr");
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
  expect(report.schemaVersion).toBe("2.0");
  expect(report.modelVersion).toBe("dice-only-6");
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
    buffer: Buffer.from(contextReplayXml({ type: 4, exposed: true }))
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
  page,
  request
}) => {
  const response = await request.post("/api/nufflizier/analyze", {
    multipart: {
      replay: {
        name: "reference.xml",
        mimeType: "application/xml",
        buffer: readFileSync(
          path.resolve("tests/fixtures/replays/sample-basic.xml")
        )
      }
    }
  });
  expect(response.ok()).toBe(true);
  const report = await response.json();
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
