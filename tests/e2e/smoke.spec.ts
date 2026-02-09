import { test, expect } from "@playwright/test";
import path from "node:path";

const SAMPLE_REPLAY_PATH = path.resolve(process.cwd(), "tests", "fixtures", "replays", "sample-basic.xml");

test("one-shot replay flow shows coaching advice", async ({ page }) => {
  await page.goto("/upload");

  await page.setInputFiles('input[name="replay"]', SAMPLE_REPLAY_PATH);
  await page.getByRole("button", { name: "Analyze Replay" }).click();

  await expect(page.getByRole("heading", { name: "Match Coaching" })).toBeVisible();
  await expect(page.getByText(/Choose your team|Advice for/)).toBeVisible();

  const teamSelect = page.locator("select").first();
  if ((await teamSelect.count()) > 0) {
    const firstPlayableTeamValue = await teamSelect.locator("option").nth(1).getAttribute("value");
    if (firstPlayableTeamValue) {
      await teamSelect.selectOption(firstPlayableTeamValue);
      await expect(teamSelect).not.toHaveValue("");
    }
  }

  await expect(page.getByRole("heading", { name: /Advice for/ })).toBeVisible();
  await expect(page.getByText("Learning mode:")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Confidence" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Replay clues" })).toBeVisible();
  await expect(page.getByText(/ResultRoll/)).toHaveCount(0);

  const impactRows = page.locator("[data-impact-score]");
  const impactCount = await impactRows.count();
  if (impactCount > 1) {
    const values: number[] = [];
    for (let index = 0; index < impactCount; index += 1) {
      const value = Number((await impactRows.nth(index).getAttribute("data-impact-score")) ?? "0");
      values.push(value);
    }

    const sorted = [...values].sort((a, b) => b - a);
    expect(values).toEqual(sorted);
  }

  await page.getByRole("button", { name: "Upload Another Replay" }).click();
  await expect(page.getByRole("heading", { name: "Match Coaching" })).toHaveCount(0);
});
