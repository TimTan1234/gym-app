import "server-only";
import { zodTextFormat } from "openai/helpers/zod";
import type { ResponseInputContent } from "openai/resources/responses/responses";
import { isAiMock, models, openai } from "./client";
import { EXERCISE_MATCH_PROMPT, languageInstruction } from "./prompts";
import { exerciseMatchSchema, type ExerciseMatch } from "./schemas";
import { matchedExerciseIds } from "./exercise-match";
import type { LibraryExercise } from "./plan";
import type { Locale } from "@/i18n/config";
import mockMatch from "./fixtures/exercise.json";

export interface ExerciseMatchInput {
  /** data:image/jpeg;base64,... (resized client-side) of the equipment. */
  imageDataUrl?: string;
  /** What the user can say about it, e.g. "machine where you sit and push a platform with your feet". */
  text?: string;
  /** The user's exercises: the library plus their own. */
  library: LibraryExercise[];
  locale?: Locale;
}

export interface IdentifiedExercises {
  recognized: boolean;
  equipment: string | null;
  exerciseIds: string[];
}

/** Which of the user's exercises are done on the equipment in a photo or description. */
export async function identifyExercises(input: ExerciseMatchInput): Promise<IdentifiedExercises> {
  const slugs = input.library.map((e) => e.slug) as [string, ...string[]];
  const schema = exerciseMatchSchema(slugs);
  let match: ExerciseMatch;
  if (isAiMock()) {
    match = schema.parse(mockMatch);
  } else {
    const catalog = input.library.map((e) => `${e.slug} (${e.name}; ${e.primaryMuscle}; ${e.equipment})`).join("\n");
    const content: ResponseInputContent[] = [
      { type: "input_text", text: `${input.text ? `Description: ${input.text}\n\n` : ""}Exercises to choose from:\n${catalog}` },
      ...(input.imageDataUrl ? [{ type: "input_image", image_url: input.imageDataUrl, detail: "auto" } as ResponseInputContent] : []),
    ];
    const response = await openai().responses.parse({
      model: models.fast(),
      instructions: EXERCISE_MATCH_PROMPT + languageInstruction(input.locale ?? "en"),
      input: [{ role: "user", content }],
      text: { format: zodTextFormat(schema, "exercise_match") },
    });
    if (!response.output_parsed) throw new Error("The AI did not return a match.");
    match = schema.parse(response.output_parsed);
  }
  const exerciseIds = matchedExerciseIds(match.matches, input.library);
  return { recognized: match.recognized, equipment: match.recognized ? match.equipment : null, exerciseIds: match.recognized ? exerciseIds : [] };
}
