import { expect, test } from "@playwright/test";
import { signUpAndOnboard } from "./helpers";

// Chromium's fake camera shows a test pattern with no one in it, so this checks
// the pipeline (camera, MediaPipe WebAssembly, pose model, frame loop), not the grading.
test.use({
  permissions: ["camera"],
  launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
});

test("form check loads the pose model, runs on the camera feed, and switches lifts", async ({ page }) => {
  // Pose tracking is slow in headless Chromium.
  test.slow();
  await signUpAndOnboard(page);
  await page.goto("/train");
  await page.getByRole("link", { name: /Form check/ }).click();
  await expect(page.getByRole("heading", { name: "Form check" })).toBeVisible();

  // Model loaded, camera on and frames processed: the overlay is drawn at the video's size, and no one is in view.
  await expect(page.getByText("Step back so hips, knees and ankles are in view")).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => page.locator("canvas").evaluate((c: HTMLCanvasElement) => c.width), { timeout: 30_000 }).not.toBe(300);
  // Camera controls sit on the view itself; the pose model is one step further in.
  await expect(page.getByRole("button", { name: "Switch camera" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset" })).toBeDisabled();
  await page.getByRole("button", { name: "More" }).click();
  await expect(page.getByRole("radio", { name: "Lite (faster)" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radio", { name: "Full (more accurate)" })).toHaveAttribute("aria-checked", "false");
  await page.getByRole("radio", { name: "Lite (faster)" }).click();
  await expect(page.getByRole("radio", { name: "Full (more accurate)" })).toHaveCount(0);
  await expect(page.getByRole("img", { name: "Knees: not judged from this angle" }).first()).toBeVisible();

  // Each lift brings its own checks and setup.
  await page.getByRole("radio", { name: "Deadlift" }).click();
  await expect(page.getByText("Judges lockout and hips")).toBeVisible();
  await expect(page.getByRole("img", { name: "Hips: not judged from this angle" }).first()).toBeVisible();
  await expect(page.getByRole("img", { name: /^Knees/ })).toHaveCount(0);
  await page.getByRole("radio", { name: "Overhead press" }).click();
  await expect(page.getByText("Step back so shoulders, elbows and wrists are in view")).toBeVisible();
});

test("a lift in the workout opens the form check for that lift and comes back to the set", async ({ page }) => {
  await signUpAndOnboard(page);
  await page.goto("/train");
  await page.getByRole("button", { name: "Empty workout" }).first().click();
  await expect(page).toHaveURL(/\/train\/workout\//);
  await page.getByRole("button", { name: "Add exercise" }).click();
  await page.getByLabel("Search exercises").fill("barbell bench");
  await page.getByRole("button", { name: /^Barbell Bench Press/ }).click();
  const bench = page.getByTestId("exercise-block").filter({ hasText: "Barbell Bench Press" });

  // Curls have no form check.
  await page.getByRole("button", { name: "Add exercise" }).click();
  await page.getByLabel("Search exercises").fill("barbell curl");
  await page.getByRole("button", { name: /^Barbell Curl/ }).click();
  await expect(page.getByTestId("exercise-block").filter({ hasText: "Barbell Curl" }).getByRole("button", { name: /^Form check/ })).toHaveCount(0);

  await bench.getByRole("button", { name: "Form check Barbell Bench Press" }).click();
  const sheet = page.getByRole("dialog", { name: "Form check: Barbell Bench Press" });
  await expect(sheet.getByText("Judges depth and lockout")).toBeVisible();
  await expect(sheet.getByRole("radio")).toHaveCount(0);
  await expect(sheet.getByText("Move the phone so shoulder, elbow and wrist are in view")).toBeVisible({ timeout: 60_000 });
  // Nobody in front of the fake camera: nothing counted, so nothing to take back yet.
  await expect(sheet.getByRole("button", { name: /^Use \d+ reps?$/ })).toHaveCount(0);
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(bench.getByLabel("Reps")).toBeVisible();
});
