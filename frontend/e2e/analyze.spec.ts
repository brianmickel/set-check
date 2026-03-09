import { test, expect } from "@playwright/test";

test.describe("Set Check app", () => {
  test("loads and shows mode tabs", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Check for a Set" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Pick cards visually" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Pick cards manually" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Upload & detect" })).toBeVisible();
  });

  test("upload tab shows analyze controls", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "Upload & detect" }).click();
    await expect(page.getByRole("button", { name: /Analyze/i })).toBeVisible();
    await expect(page.getByLabel("Model")).toBeVisible();
  });
});
