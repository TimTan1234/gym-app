import { zodTextFormat } from "openai/helpers/zod";

/**
 * zodTextFormat without array size limits. Gemini rejects a request whose schema puts
 * minItems/maxItems on an array of objects; the reply is still checked against the Zod schema.
 */
export const textFormat: typeof zodTextFormat = (schema, name, props) => {
  const format = zodTextFormat(schema, name, props);
  dropArrayLimits(format.schema);
  return format;
};

function dropArrayLimits(node: unknown) {
  if (Array.isArray(node)) return node.forEach(dropArrayLimits);
  if (!node || typeof node !== "object") return;
  const schema = node as Record<string, unknown>;
  if (schema.type === "array") {
    delete schema.minItems;
    delete schema.maxItems;
  }
  Object.values(schema).forEach(dropArrayLimits);
}
