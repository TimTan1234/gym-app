import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zodResponsesFunction, zodTextFormat } from "openai/helpers/zod";
import { MealAnalysisSchema, planDraftSchema } from "@/lib/ai/schemas";
import { EXERCISES } from "../../prisma/seed/exercises";

// Builds the exact request formats sent to OpenAI. Strict structured outputs
// require every object to list all keys as required and forbid extra keys;
// checking that here catches schema mistakes without a network call or key.

type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  additionalProperties?: boolean;
  anyOf?: JsonSchema[];
};

function assertStrict(schema: JsonSchema, path = "$") {
  if (schema.type === "object" && schema.properties) {
    expect(schema.additionalProperties, `${path} additionalProperties`).toBe(false);
    expect(new Set(schema.required), `${path} required`).toEqual(new Set(Object.keys(schema.properties)));
    for (const [k, v] of Object.entries(schema.properties)) assertStrict(v, `${path}.${k}`);
  }
  if (schema.items) assertStrict(schema.items, `${path}[]`);
  schema.anyOf?.forEach((s, i) => assertStrict(s, `${path}|${i}`));
}

describe("OpenAI request formats", () => {
  it("meal analysis schema is strict-compatible", () => {
    const format = zodTextFormat(MealAnalysisSchema, "meal_analysis");
    expect(format.strict).toBe(true);
    assertStrict(format.schema as JsonSchema);
  });

  it("plan schema with the full exercise enum is strict-compatible", () => {
    const slugs = EXERCISES.map((e) => e.slug) as [string, ...string[]];
    const format = zodTextFormat(planDraftSchema(slugs), "training_plan");
    assertStrict(format.schema as JsonSchema);
  });

  it("coach function tools are strict-compatible", () => {
    const tool = zodResponsesFunction({
      name: "propose_plan",
      parameters: z.object({ plan: planDraftSchema(["back-squat", "deadlift"]), reason: z.string() }),
    });
    expect(tool.type).toBe("function");
    expect(tool.strict).toBe(true);
    assertStrict(tool.parameters as JsonSchema);
  });
});
