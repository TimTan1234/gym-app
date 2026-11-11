import { beforeEach, describe, expect, it, vi } from "vitest";
import mealFixture from "@/lib/ai/fixtures/meal.json";
import { MealAnalysisSchema } from "@/lib/ai/schemas";
import { analyzeMeal } from "@/lib/ai/meal";

const parse = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/client", () => ({
  isAiMock: () => false,
  models: { fast: () => "test-model" },
  openai: () => ({ responses: { parse } }),
}));

// What the SDK throws for the two ways a reply misses the schema.
const schemaEchoedFirst = () => Promise.reject(new SyntaxError("Error reading response: invalid structured output JSON."));
const schemaEchoedAlone = async () => MealAnalysisSchema.parse({ $schema: "http://json-schema.org/draft-07/schema#" });
const answer = async () => ({ output_parsed: mealFixture });

describe("meal analysis retry", () => {
  beforeEach(() => parse.mockReset());

  it("asks once more when the reply isn't the schema's JSON", async () => {
    parse.mockImplementationOnce(schemaEchoedFirst).mockImplementationOnce(answer);
    expect((await analyzeMeal({ text: "nasi lemak" })).title).toBe(mealFixture.title);
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it("asks once more when the JSON doesn't fit the schema", async () => {
    parse.mockImplementationOnce(schemaEchoedAlone).mockImplementationOnce(answer);
    expect((await analyzeMeal({ text: "nasi lemak" })).items).toHaveLength(mealFixture.items.length);
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it("fails after a second unreadable reply", async () => {
    parse.mockImplementationOnce(schemaEchoedFirst).mockImplementationOnce(schemaEchoedAlone);
    await expect(analyzeMeal({ text: "nasi lemak" })).rejects.toThrow("did not return a nutrition estimate");
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it("doesn't retry a failed request", async () => {
    parse.mockRejectedValueOnce(new Error("429 Too Many Requests"));
    await expect(analyzeMeal({ text: "nasi lemak" })).rejects.toThrow("429");
    expect(parse).toHaveBeenCalledTimes(1);
  });
});
