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

test("background photos: light and dark each have their own and switch with the theme", async ({ page }) => {
  const photoLayer = () => page.evaluate(() => getComputedStyle(document.body, "::before").backgroundImage);
  const saved = (mode: "light" | "dark") => page.evaluate((m) => localStorage.getItem(`gympal.background.${m}`)!, mode);
  await page.emulateMedia({ colorScheme: "light" });
  await signUpAndOnboard(page);
  await page.goto("/settings");

  await page.getByTestId("background-light-input").setInputFiles("tests/fixtures/nasi-lemak.jpg");
  await expect(page.getByRole("img", { name: "Light mode background photo" })).toBeVisible();
  const light = await saved("light");
  expect(await photoLayer()).toContain(light);
  await page.emulateMedia({ colorScheme: "dark" }); // no dark photo yet: the plain canvas
  expect(await photoLayer()).not.toContain("data:image");

  await page.getByTestId("background-dark-input").setInputFiles("tests/fixtures/grocery-list.jpg");
  await expect(page.getByRole("img", { name: "Dark mode background photo" })).toBeVisible();
  const dark = await saved("dark");
  expect(dark).not.toBe(light);
  expect(await photoLayer()).toContain(dark);

  // System follows the device; the explicit themes override it. Both survive a reload.
  await page.goto("/today");
  await page.reload();
  expect(await photoLayer()).toContain(dark);
  await page.emulateMedia({ colorScheme: "light" });
  expect(await photoLayer()).toContain(light);
  await page.goto("/settings");
  await page.getByRole("radiogroup", { name: "Appearance" }).getByRole("radio", { name: "Dark" }).click();
  expect(await photoLayer()).toContain(dark);

  await page.getByRole("button", { name: "Remove dark mode background photo" }).click();
  expect(await photoLayer()).not.toContain("data:image");
  await page.getByRole("radiogroup", { name: "Appearance" }).getByRole("radio", { name: "Light" }).click();
  expect(await photoLayer()).toContain(light);
  await page.getByRole("button", { name: "Remove light mode background photo" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-bg-photo");
  expect(await photoLayer()).toBe("none");
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
