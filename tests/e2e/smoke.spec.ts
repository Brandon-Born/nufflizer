import { test, expect } from "@playwright/test";
import path from "node:path";
import { readFileSync } from "node:fs";

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
  await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
  await expect(
    page.getByRole("heading", { name: "Nuffle Match Report" })
  ).toBeVisible();
  await expect(
    page.getByText(
      "Partial dice analysis. Whole-match luck cannot be determined from the supported evidence.",
      { exact: true }
    )
  ).toBeVisible();
  await expect(
    page.getByText("Block: Not scored", { exact: true })
  ).toHaveCount(2);
  await page
    .getByLabel("Category", { exact: true })
    .selectOption("ball_handling");
  await expect(page.getByRole("status")).toContainText("4 matching events");
  await expect(
    page
      .locator("tbody tr")
      .filter({ hasText: /Ball handling (?:failed|succeeded)/ })
  ).toHaveCount(4);
  await page.locator("summary").first().click();
  await expect(page.getByText(/Source: source-/).first()).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).click();
  const download = await downloadPromise;
  const report = JSON.parse(readFileSync((await download.path())!, "utf8"));
  expect(report.schemaVersion).toBe("2.0");
  expect(report.coverage.scoredByType.ball_handling).toBe(4);
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
