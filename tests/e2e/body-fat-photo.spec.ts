import { expect, test } from "@playwright/test";
import { signUpAndOnboard } from "./helpers";

test("body fat from photos: estimate a range, use it, and it's saved and charted as an estimate", async ({ page }) => {
  await signUpAndOnboard(page);
  await page.goto("/progress");

  // The route checks its input before spending an AI call
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const estimate = (data: object) => page.request.post("/api/ai/bodyfat", { data });
  for (const [data, error] of [
    [{ images: [] }, "Add a photo first"],
    [{ images: Array(4).fill(png) }, "Add up to 3 photos"],
    [{ images: ["data:image/gif;base64,R0lGOD"] }, "Unsupported image format"],
  ] as const) {
    const res = await estimate(data);
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe(error);
  }

  // Guidance and privacy first, then photos, then a range
  await page.getByRole("button", { name: "Estimate from photos" }).click();
  await expect(page.getByText("Photos go to our AI provider for this estimate and aren't saved.")).toBeVisible();
  await page.getByTestId("body-photos-input").setInputFiles(["public/icons/icon-512.png", "public/icons/icon-192.png"]);
  await expect(page.getByAltText("Body photo 2")).toBeVisible();
  await page.getByRole("button", { name: "Estimate body fat" }).click();
  await expect(page.getByText("About 20.5%")).toBeVisible();
  await expect(page.getByText("Likely 17–23.5%")).toBeVisible();
  await expect(page.getByText(/can be off by several points/)).toBeVisible();

  // Using it fills the form, marked as an estimate; saving keeps the mark
  await page.getByRole("button", { name: "Use 20.5%" }).click();
  const log = page.locator("form", { has: page.getByLabel("Body fat %") });
  await expect(log.getByLabel("Body fat %")).toHaveValue("20.5");
  await expect(page.getByText("≈ 20.5% · photo estimate")).toBeVisible();
  await log.getByLabel("Date").fill(new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10));
  await log.getByLabel("Weight (kg)").fill("78.4");
  await log.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTitle("photo estimate")).toHaveText("≈20.5% · photo estimate");

  // A typed reading is a measurement; with two entries the chart shows and keys the estimate
  await log.getByLabel("Weight (kg)").fill("78");
  await log.getByLabel("Body fat %").fill("19.8");
  await log.getByRole("button", { name: "Save" }).click();
  const chart = page.getByRole("figure").filter({ hasText: "Body fat" });
  await expect(chart.getByText("Photo estimate", { exact: true })).toBeVisible();
  await expect(page.getByText("19.8%", { exact: true })).toBeVisible();
  await chart.getByRole("button", { name: "Table" }).click();
  await expect(chart.getByRole("cell", { name: "≈20.5" })).toBeVisible();
  await expect(chart.getByRole("cell", { name: "19.8", exact: true })).toBeVisible();

  // A quick weigh-in on Today keeps the day's body fat
  await page.goto("/today");
  await page.getByLabel("Today's weight in kg").fill("77.9");
  await page.getByRole("button", { name: "Log", exact: true }).click();
  await expect(page.getByText("Weight logged. Targets updated.")).toBeVisible();
  await page.goto("/progress");
  await expect(page.getByText("19.8%", { exact: true })).toBeVisible();
});
