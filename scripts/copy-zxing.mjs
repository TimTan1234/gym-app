// Copy the ZXing barcode reader WebAssembly into public/ so the scanner
// loads it from this site instead of a CDN. Runs on postinstall.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
mkdirSync("public/vendor", { recursive: true });
copyFileSync(require.resolve("zxing-wasm/reader/zxing_reader.wasm"), "public/vendor/zxing_reader.wasm");
