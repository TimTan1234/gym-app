import "server-only";
import { zodTextFormat } from "openai/helpers/zod";
import type { ResponseInputContent } from "openai/resources/responses/responses";
import { isAiMock, models, openai } from "./client";
import { BODY_FAT_SYSTEM_PROMPT, languageInstruction } from "./prompts";
import type { Locale } from "@/i18n/config";
import { BodyFatEstimateSchema, type BodyFatEstimate } from "./schemas";
import mockEstimate from "./fixtures/bodyfat.json";

export interface BodyFatInput {
  /** data:image/jpeg;base64,... (resized client-side): front, side and/or back. */
  imageDataUrls: string[];
  /** From the profile and latest weigh-in on the server, never from the client. */
  sex: "MALE" | "FEMALE";
  age: number;
  heightCm: number;
  weightKg: number | null;
  waistCm: number | null;
  locale?: Locale;
}

/** The model declined to judge the photos (a refusal, not a parse error). */
export class BodyFatRefusal extends Error {}

export async function estimateBodyFat(input: BodyFatInput): Promise<BodyFatEstimate> {
  if (isAiMock()) return normalizeBodyFat(BodyFatEstimateSchema.parse(mockEstimate));

  const facts = [
    `Sex: ${input.sex === "FEMALE" ? "female" : "male"}`,
    `Age: ${input.age}`,
    `Height: ${Math.round(input.heightCm)} cm`,
    input.weightKg ? `Weight: ${input.weightKg} kg` : null,
    input.waistCm ? `Waist: ${input.waistCm} cm` : null,
  ].filter(Boolean);
  const content: ResponseInputContent[] = [
    { type: "input_text", text: `${facts.join(". ")}.\nEstimate this person's body fat percentage from ${input.imageDataUrls.length > 1 ? "these photos" : "this photo"}.` },
    ...input.imageDataUrls.map((url): ResponseInputContent => ({ type: "input_image", image_url: url, detail: "auto" })),
  ];

  const response = await openai().responses.parse({
    model: models.fast(),
    instructions: BODY_FAT_SYSTEM_PROMPT + languageInstruction(input.locale ?? "en"),
    input: [{ role: "user", content }],
    text: { format: zodTextFormat(BodyFatEstimateSchema, "body_fat_estimate") },
  });

  const parsed = response.output_parsed;
  if (!parsed) throw new BodyFatRefusal("The AI did not return a body-fat estimate.");
  return normalizeBodyFat(BodyFatEstimateSchema.parse(parsed));
}

const half = (n: number) => Math.round(n * 2) / 2;
const clamp = (n: number) => Math.min(60, Math.max(3, n));

/**
 * Keep the estimate believable and honest about its error: within 3–60%,
 * low ≤ estimate ≤ high, at least ±2 points either side, on half points.
 * An unusable result keeps only its reason.
 */
export function normalizeBodyFat(e: BodyFatEstimate): BodyFatEstimate {
  if (!e.usable || e.estimatePct === null) return { usable: false, reason: e.reason ?? "body_not_visible", estimatePct: null, lowPct: null, highPct: null, cues: [] };
  const estimate = clamp(e.estimatePct);
  // A range given the wrong way round is still a range.
  const [lo, hi] = [e.lowPct ?? estimate, e.highPct ?? estimate].sort((a, b) => a - b);
  const low = clamp(Math.min(lo, estimate - 2));
  const high = clamp(Math.max(hi, estimate + 2));
  return { usable: true, reason: null, estimatePct: half(estimate), lowPct: half(low), highPct: half(high), cues: e.cues.slice(0, 3) };
}
