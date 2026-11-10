import { expect, test } from "@playwright/test";
import { signUpAndOnboard } from "./helpers";

const DARK_BG = "rgb(24, 23, 21)";
const LIGHT_BG = "rgb(250, 249, 245)";
const bodyBg = (page: import("@playwright/test").Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test("appearance: dark and light override the device setting and survive a reload", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await signUpAndOnboard(page);
  await page.goto("/settings/display");
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

  // The status bar keeps the chosen theme's colour through navigations, never falling back to the device's.
  await page.evaluate(() => {
    const read = () => [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map((m) => `${m.content} ${m.media}`.trim()).join(" | ");
    const seen = [read()];
    new MutationObserver(() => seen.push(read())).observe(document.head, { childList: true, subtree: true, attributes: true });
    (window as unknown as { themeColors: string[] }).themeColors = seen;
  });
  const nav = page.getByRole("navigation", { name: "Main" });
  for (const [tab, url] of [["Progress", /\/progress$/], ["Today", /\/today$/], ["Progress", /\/progress$/]] as const) {
    await nav.getByRole("link", { name: tab }).click();
    await expect(page).toHaveURL(url);
  }
  await expect(page.getByRole("heading", { level: 1, name: "Progress" })).toBeVisible();
  expect(new Set(await page.evaluate(() => (window as unknown as { themeColors: string[] }).themeColors))).toEqual(new Set(["#181715"]));

  await page.goto("/settings/display");
  await page.getByRole("radiogroup", { name: "Appearance" }).getByRole("radio", { name: "System" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
  expect(await bodyBg(page)).toBe(LIGHT_BG);
  // On System the status bar follows the device again.
  const metas = page.locator('meta[name="theme-color"]');
  await expect(metas).toHaveCount(2);
  expect(await metas.evaluateAll((ms: HTMLMetaElement[]) => ms.map((m) => `${m.content} ${m.media}`))).toEqual([
    "#faf9f5 (prefers-color-scheme: light)",
    "#181715 (prefers-color-scheme: dark)",
  ]);
});

test("background photos: light and dark each have their own and switch with the theme", async ({ page }) => {
  const photoLayer = () => page.evaluate(() => getComputedStyle(document.body, "::before").backgroundImage);
  const saved = (mode: "light" | "dark") => page.evaluate((m) => localStorage.getItem(`gympal.background.${m}`)!, mode);
  await page.emulateMedia({ colorScheme: "light" });
  await signUpAndOnboard(page);
  await page.goto("/settings/display");

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
  await page.goto("/settings/display");
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
  await page.goto("/settings/display");
  await page.getByRole("radiogroup", { name: "Language" }).getByRole("radio", { name: "简体中文" }).click();

  await expect(page.getByRole("heading", { name: "显示" })).toBeVisible();
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
  await page.goto("/settings/display");
  await page.getByRole("radiogroup", { name: "语言" }).getByRole("radio", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: "Display" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});
