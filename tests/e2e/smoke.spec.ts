import { test, expect } from "@playwright/test";
import path from "node:path";

const SAMPLE_REPLAY_PATH = path.resolve(process.cwd(), "tests", "fixtures", "replays", "sample-basic.xml");

test("one-shot replay flow shows nufflizier analysis", async ({ page }) => {
  await page.goto("/nufflizier");

  await page.setInputFiles('input[name="replay"]', SAMPLE_REPLAY_PATH);
  await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();

  await expect(page.getByRole("heading", { name: "Nuffle Match Report" })).toBeVisible();
  await expect(page.getByText(/blessed by nuffle|Nuffle called this one even/)).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Weighted Delta" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download JSON" })).toBeVisible();

  await page.getByRole("button", { name: "Upload Another Replay" }).click();
  await expect(page.getByRole("heading", { name: "Nuffle Match Report" })).toHaveCount(0);
});
