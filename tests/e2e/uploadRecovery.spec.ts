import { test, expect } from "@playwright/test";

test("upload selection, drop replacement, cancellation and retry work on mobile", async ({
  page
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  let requests = 0;
  await page.route("**/api/nufflizier/analyze", async (route) => {
    requests++;
    if (requests === 1) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    await route
      .fulfill({ status: 503, contentType: "text/html", body: "Unavailable" })
      .catch(() => {});
  });
  await page.goto("/nufflizier");
  await expect(page).toHaveTitle("Nufflizier");
  await expect(page).toHaveURL(/\/nufflizier$/);
  const input = page.locator('input[name="replay"]');
  await input.focus();
  await expect(input).toBeFocused();
  await input.setInputFiles({
    name: "first.xml",
    mimeType: "text/xml",
    buffer: Buffer.from("replay")
  });
  await expect(page.getByText(/Ready: first.xml/)).toBeVisible();
  const transfer = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File(["replay"], "dropped.bbr"));
    return data;
  });
  await page
    .getByText("Choose or drop your replay")
    .dispatchEvent("drop", { dataTransfer: transfer });
  await expect(input).toHaveValue("");
  await expect(page.getByText(/Ready: dropped.bbr/)).toBeVisible();
  expect(requests).toBe(0);
  await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
  await page.getByRole("button", { name: "Cancel analysis" }).click();
  await expect(page.getByText("Analysis cancelled. You can retry or choose another replay.", { exact: true })).toContainText("cancelled");
  await page.getByRole("button", { name: "Analyze Nuffle Luck" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByText(/Ready: dropped.bbr/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Analyze Nuffle Luck" })
  ).toBeEnabled();
  await expect(
    page.getByRole("heading", { name: "Nuffle Match Report" })
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "/tmp/nufflizier-upload-recovery-mobile.png" });
  expect(pageErrors).toEqual([]);
  expect(await page.locator("nextjs-portal").count()).toBe(0);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({
    path: "/tmp/nufflizier-upload-recovery-desktop.png"
  });
});
