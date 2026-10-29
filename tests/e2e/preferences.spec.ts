import { expect, test } from "@playwright/test";
import { signUpAndOnboard } from "./helpers";

const DARK_BG = "rgb(24, 23, 21)";
const LIGHT_BG = "rgb(250, 249, 245)";
const bodyBg = (page: import("@playwright/test").Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test("appearance: dark and light override the device setting and survive a reload", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await signUpAndOnboard(page);
  await page.goto("/settings");
  expect(await bodyBg(page)).toBe(DARK_BG); // System follows the (dark) device

  const appearance = page.getByRole("radiogroup", { name: "Appearance" });
  await appearance.getByRole("radio", { name: "Light" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await bodyBg(page)).toBe(LIGHT_BG);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await bodyBg(page)).toBe(LIGHT_BG);

  await page.emulateMedia({ colorScheme: "light" });
  await page.getByRole("radiogroup", { name: "Appearance" }).getByRole("radio", { name: "Dark" }).click();
  await page.goto("/today");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await bodyBg(page)).toBe(DARK_BG);

  await page.goto("/settings");
  await page.getByRole("radiogroup", { name: "Appearance" }).getByRole("radio", { name: "System" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
  expect(await bodyBg(page)).toBe(LIGHT_BG);
});

test("language: switching to Chinese translates the app and survives a reload", async ({ page }) => {
  await signUpAndOnboard(page);
  await page.goto("/settings");
  await page.getByRole("radiogroup", { name: "Language" }).getByRole("radio", { name: "简体中文" }).click();

  await expect(page.getByRole("heading", { name: "设置" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hans");
  await expect(page.getByRole("radiogroup", { name: "语言" }).getByRole("radio", { name: "简体中文" })).toHaveAttribute("aria-checked", "true");

  const nav = page.getByRole("navigation", { name: "主导航" });
  await nav.getByRole("link", { name: "今天" }).click();
  await expect(page).toHaveURL(/\/today/);
  await expect(nav).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hans");
  await expect(nav.getByRole("link", { name: "饮食" })).toBeVisible();

  // And back to English
  await page.goto("/settings");
  await page.getByRole("radiogroup", { name: "语言" }).getByRole("radio", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});
