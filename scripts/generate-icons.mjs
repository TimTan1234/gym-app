// Renders the app icon SVG to PNGs with Playwright's Chromium.
// Usage: node scripts/generate-icons.mjs
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const glyph = `
  <g fill="#11140b">
    <rect x="148" y="236" width="216" height="40" rx="10"/>
    <rect x="104" y="176" width="44" height="160" rx="14"/>
    <rect x="364" y="176" width="44" height="160" rx="14"/>
    <rect x="68" y="206" width="36" height="100" rx="12"/>
    <rect x="408" y="206" width="36" height="100" rx="12"/>
  </g>`;

// Maskable: full-bleed background, glyph inside the 80% safe zone.
const svg = (rounded) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="#c6f432"/>
  ${glyph}
</svg>`;

writeFileSync("public/icons/icon.svg", svg(true));

const targets = [
  { file: "public/icons/icon-192.png", size: 192, rounded: true },
  { file: "public/icons/icon-512.png", size: 512, rounded: true },
  { file: "public/icons/maskable-512.png", size: 512, rounded: false },
  { file: "public/icons/apple-touch-icon.png", size: 180, rounded: false },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg(t.rounded).replace("<svg ", `<svg width="${t.size}" height="${t.size}" `)}</body></html>`,
  );
  await page.screenshot({ path: t.file, omitBackground: true });
  console.log("wrote", t.file);
}
await browser.close();
