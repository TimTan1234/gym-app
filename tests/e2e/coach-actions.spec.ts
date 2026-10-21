import { expect, test, type Page } from "@playwright/test";
import { signUpAndOnboard } from "./helpers";

async function ask(page: Page, message: string) {
  const before = await page.getByTestId("proposal").count();
  await page.getByLabel("Message the coach").fill(message);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("proposal")).toHaveCount(before + 1);
  await expect(page.getByTestId("chat-log")).toHaveAttribute("aria-busy", "false");
  return page.getByTestId("proposal").nth(before);
}

test("coach logs, edits and deletes a meal; conversations can be deleted", async ({ page }) => {
  await signUpAndOnboard(page);
  await page.goto("/coach");

  const log = await ask(page, "Log nasi lemak with fried chicken");
  await expect(log.getByText("Log lunch,")).toBeVisible();
  await expect(log.getByText("Coconut rice")).toBeVisible();
  await log.getByRole("button", { name: "Apply" }).click();
  await expect(log.getByRole("button", { name: "Applied" })).toBeVisible();
  await expect(page).toHaveURL(/\/coach\?thread=/);
  const thread = page.url();

  await page.goto("/nutrition");
  await expect(page.getByText("Nasi lemak with fried chicken")).toBeVisible();

  // Rice from 200 g to 150 g: its 340 kcal scale to 255
  await page.goto(thread);
  const update = await ask(page, "The rice was only 150 grams");
  await expect(update.getByText("Update Nasi lemak with fried chicken")).toBeVisible();
  await expect(update.getByText("Coconut rice 200 → 150 g")).toBeVisible();
  await expect(update.getByText("255", { exact: true })).toBeVisible();
  await update.getByRole("button", { name: "Apply" }).click();
  await expect(update.getByRole("button", { name: "Applied" })).toBeVisible();

  const del = await ask(page, "Please delete that meal");
  await expect(del.getByText("Delete Nasi lemak with fried chicken")).toBeVisible();
  await del.getByRole("button", { name: "Delete meal" }).click();
  await expect(del.getByRole("button", { name: "Deleted" })).toBeVisible();

  await page.goto("/nutrition");
  await expect(page.getByText("Nasi lemak with fried chicken")).toHaveCount(0);

  // The conversation can be deleted from Past conversations
  await page.goto(thread);
  await page.getByText("Past conversations").click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /^Delete conversation:/ }).click();
  await expect(page.getByText("Conversation deleted")).toBeVisible();
  await expect(page).toHaveURL(/\/coach$/);
  await expect(page.getByText("Past conversations")).toHaveCount(0);
});

test("coach edits the active plan in place", async ({ page }) => {
  await signUpAndOnboard(page);
  await page.getByRole("link", { name: "Create a plan" }).click();
  await page.getByRole("button", { name: "Build muscle" }).click();
  await page.getByRole("button", { name: "Generate plan" }).click();
  await page.getByRole("button", { name: "Save & activate" }).click();
  await expect(page).toHaveURL(/\/train\/plans$/);

  await page.goto("/coach");
  const edit = await ask(page, "Swap my first exercise");
  const changes = edit.getByTestId("plan-changes");
  await expect(changes.getByText("Upper A: remove Barbell Bench Press")).toBeVisible();
  await expect(changes.getByText(/^Upper A: add Dumbbell Bench Press, 4×5–8/)).toBeVisible();
  await expect(changes.getByRole("listitem")).toHaveCount(2);
  // A second card built from the same plan goes stale once the first is applied
  const again = await ask(page, "Swap my first exercise");
  await edit.getByRole("button", { name: "Apply" }).click();
  await expect(edit.getByRole("button", { name: "Applied" })).toBeVisible();
  await again.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("This card is out of date")).toBeVisible();
  await expect(again.getByRole("button", { name: "Apply" })).toBeEnabled();

  // Still one plan, now with the swap
  await page.goto("/train/plans");
  await expect(page.getByText("Active", { exact: true })).toHaveCount(1);
  await page.getByRole("link", { name: "Today" }).click();
  await page.getByRole("button", { name: "Start Upper A" }).click();
  await expect(page.getByTestId("exercise-block").filter({ hasText: "Dumbbell Bench Press" })).toHaveCount(1);
  await expect(page.getByTestId("exercise-block").filter({ hasText: "Barbell Bench Press" })).toHaveCount(0);
});

test("coach conversations: apply then send keeps the reply, New chat clears, past ones reopen", async ({ page }) => {
  await signUpAndOnboard(page);
  await page.goto("/coach");
  const first = await ask(page, "Should I change my calorie targets?");

  // Sending straight after Apply: the refresh Apply triggers must not wipe the new reply
  await first.getByRole("button", { name: "Apply" }).click();
  await page.getByLabel("Message the coach").fill("Log kaya toast and kopi");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("proposal")).toHaveCount(2);
  await expect(first.getByRole("button", { name: "Applied" })).toBeVisible();
  await expect(page).toHaveURL(/thread=/);
  await page.reload();
  await expect(page.getByTestId("proposal")).toHaveCount(2);

  // New chat starts empty, even right after a reply
  await page.getByRole("link", { name: "New chat" }).click();
  await expect(page).toHaveURL(/\/coach$/);
  const log = page.getByTestId("chat-log");
  await expect(log.getByText("Should I change my calorie targets?")).toHaveCount(0);
  await page.getByLabel("Message the coach").fill("How is my protein?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(log).toHaveAttribute("aria-busy", "false");
  await expect(log.getByText("How is my protein?")).toBeVisible();

  // The earlier conversation reopens from Past conversations
  await page.getByText("Past conversations").click();
  await page.getByRole("link", { name: "Should I change my calorie targets?" }).click();
  await expect(log.getByText("How is my protein?")).toHaveCount(0);
  await expect(page.getByTestId("proposal")).toHaveCount(2);
});
