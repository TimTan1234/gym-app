// Fetches the fonts the weekly recap image is drawn with (src/app/api/recap/image), cut down
// by Google Fonts to the characters the card can show, so they stay small enough to ship.
// Run again after changing the card's Chinese copy: npx tsx scripts/recap-fonts.ts
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { LATIN, cardChinese } from "../src/lib/recap-glyphs";

const OUT = join(__dirname, "../src/assets/recap");

const FONTS = [
  { file: "inter-400.ttf", family: "Inter:wght@400", text: LATIN },
  { file: "inter-600.ttf", family: "Inter:wght@600", text: LATIN },
  { file: "source-serif-4-400.ttf", family: "Source+Serif+4:wght@400", text: LATIN },
  { file: "noto-sans-sc-400.ttf", family: "Noto+Sans+SC:wght@400", text: cardChinese() },
  { file: "noto-sans-sc-600.ttf", family: "Noto+Sans+SC:wght@600", text: cardChinese() },
];

async function main() {
  await mkdir(OUT, { recursive: true });
  for (const f of FONTS) {
    // With no browser user agent, the stylesheet points at TrueType files, which the image renderer reads.
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${f.family}&text=${encodeURIComponent(f.text)}`)).text();
    const url = css.match(/url\((https:[^)]+)\)/)?.[1];
    if (!url) throw new Error(`No font file for ${f.family}: ${css.slice(0, 200)}`);
    const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
    await writeFile(join(OUT, f.file), bytes);
    console.log(`${f.file}: ${(bytes.length / 1024).toFixed(1)} kB`);
  }
  await writeFile(join(OUT, "noto-sans-sc.chars.txt"), `${cardChinese()}\n`);
}

void main();
