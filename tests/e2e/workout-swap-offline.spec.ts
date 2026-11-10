import { expect, test, type Page } from "@playwright/test";
import { signUpAndOnboard } from "./helpers";

async function startUpperA(page: Page) {
  await signUpAndOnboard(page);
  await page.goto("/train/plans/new");
  await page.getByRole("button", { name: "Build muscle" }).click();
  await page.getByRole("button", { name: "Generate plan" }).click();
  await page.getByRole("button", { name: "Save & activate" }).click();
  await expect(page).toHaveURL(/\/train\/plans$/);
  await page.goto("/train");
  await page.getByRole("button", { name: "Start Upper A" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Start with these sets" }).click();
  await expect(page).toHaveURL(/\/train\/workout\//);
  await expect(page.getByTestId("exercise-block")).toHaveCount(5);
}

async function logOne(page: Page, exercise: RegExp | string) {
  const block = page.getByTestId("exercise-block").filter({ hasText: exercise });
  await block.getByLabel("kg").fill("60");
  await block.getByLabel("Reps").fill("8");
  await block.getByRole("button", { name: /^Log set for/ }).click();
  return block;
}

test("workout: swap an exercise; it keeps the planned target and place", async ({ page }) => {
  await startUpperA(page);
  const blocks = page.getByTestId("exercise-block");
  await blocks.first().getByRole("button", { name: "Swap Barbell Bench Press" }).click();

  const sheet = page.getByRole("dialog", { name: "Swap Barbell Bench Press" });
  const suggested = sheet.getByRole("region", { name: "Suggested swaps" }).getByRole("button");
  await expect(suggested.first()).toBeVisible();
  const pick = (await suggested.first().locator("span").first().innerText()).trim();
  await suggested.first().click();

  // Same slot, same target, a new exercise.
  await expect(blocks.first()).toContainText(pick);
  await expect(blocks.first()).toContainText("4 sets of 5–8");
  await expect(blocks.filter({ hasText: "Barbell Bench Press" })).toHaveCount(pick === "Barbell Bench Press" ? 1 : 0);
  await page.reload();
  await expect(blocks).toHaveCount(5);
  await expect(blocks.first()).toContainText(pick);
  await expect(blocks.first()).toContainText("4 sets of 5–8");

  // Once a set is logged, the sets belong to this exercise: no more swapping it.
  await logOne(page, pick);
  await expect(blocks.first().getByRole("button", { name: /^Edit set/ })).toHaveCount(1);
  await expect(blocks.first().getByRole("button", { name: /^Swap / })).toHaveCount(0);
});

test("workout: a set logged with no signal waits on the phone and saves once when back online", async ({ page, context }) => {
  await startUpperA(page);
  await context.setOffline(true);
  const bench = await logOne(page, "Barbell Bench Press");
  await expect(bench.getByText("waiting to sync")).toHaveCount(1);
  // Not saved yet, so it can't be edited; it can still be dropped.
  await expect(bench.getByRole("button", { name: /^Edit set/ })).toHaveCount(0);
  await expect(bench.getByRole("button", { name: "Delete set 1" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "1 set waiting to sync" })).toBeVisible();

  // Finishing now would leave the workout empty on the server: it waits for the set.
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByText("1 set is still waiting to sync")).toBeVisible();
  await expect(page.getByRole("dialog", { name: /Finish/ })).toHaveCount(0);

  await context.setOffline(false);
  await expect(page.getByText("set waiting to sync")).toHaveCount(0, { timeout: 20_000 });
  await page.reload();
  await expect(page.getByTestId("exercise-block").filter({ hasText: "Barbell Bench Press" }).getByRole("button", { name: /^Edit set/ })).toHaveCount(1);
});

test("workout: a set whose reply is lost is sent again but saved once", async ({ page }) => {
  await startUpperA(page);
  // The first save reaches the server, but the phone never hears back.
  let dropped = false;
  await page.route("**/train/workout/**", async (route) => {
    const req = route.request();
    if (!dropped && req.method() === "POST" && req.headers()["next-action"]) {
      dropped = true;
      await route.fetch();
      return route.abort("failed");
    }
    return route.continue();
  });
  await logOne(page, "Barbell Bench Press");
  await expect(page.getByText("set waiting to sync")).toHaveCount(0, { timeout: 20_000 });
  expect(dropped).toBe(true);
  await page.reload();
  await expect(page.getByTestId("exercise-block").filter({ hasText: "Barbell Bench Press" }).getByRole("button", { name: /^Edit set/ })).toHaveCount(1);
});
