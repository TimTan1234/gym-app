// Put third-party runtime files into public/vendor so the app loads them from
// this site instead of a CDN. Runs on postinstall (and in the Docker build).
//  - ZXing barcode reader WebAssembly (nutrition barcode scanner)
//  - MediaPipe vision WebAssembly and pose models (squat form check)
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
mkdirSync("public/vendor/mediapipe", { recursive: true });
copyFileSync(require.resolve("zxing-wasm/reader/zxing_reader.wasm"), "public/vendor/zxing_reader.wasm");

// FilesetResolver.forVisionTasks() picks the SIMD build or, on older browsers, the no-SIMD one.
const mediapipeWasm = join(dirname(require.resolve("@mediapipe/tasks-vision")), "wasm");
for (const name of ["vision_wasm_internal", "vision_wasm_nosimd_internal"]) {
  for (const ext of [".js", ".wasm"]) copyFileSync(join(mediapipeWasm, name + ext), `public/vendor/mediapipe/${name}${ext}`);
}

// The models aren't on npm. Download a pinned version once and check its hash.
const MODELS = {
  pose_landmarker_lite: "59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a",
  pose_landmarker_full: "5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1",
};
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

for (const [model, hash] of Object.entries(MODELS)) {
  const dest = `public/vendor/mediapipe/${model}.task`;
  if (existsSync(dest) && sha256(readFileSync(dest)) === hash) continue;
  const url = `https://storage.googleapis.com/mediapipe-models/pose_landmarker/${model}/float16/1/${model}.task`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Downloading ${url} failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (sha256(buf) !== hash) throw new Error(`${model}.task does not match its pinned hash`);
  writeFileSync(dest, buf);
}
