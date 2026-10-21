import { expect, test } from "@playwright/test";
import { signUpAndOnboard } from "./helpers";

// Chromium's fake camera shows a test pattern with no one in it, so this checks
// the pipeline (camera, MediaPipe WebAssembly, pose model, frame loop), not the grading.
test.use({
  permissions: ["camera"],
  launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
});

test("squat form check loads the pose model and runs on the camera feed", async ({ page }) => {
  await signUpAndOnboard(page);
  await page.goto("/train");
  await page.getByRole("link", { name: /Squat form check/ }).click();
  await expect(page.getByRole("heading", { name: "Squat form check" })).toBeVisible();

  // Model loaded, camera on and frames processed: the fps readout appears and no one is in view.
  await expect(page.getByText("Step back so hips, knees and ankles are in view")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/^[1-9]\d* fps$/)).toBeVisible();
  await expect(page.getByText("Squat and each rep is judged here.")).toBeVisible();
});
