import { getUserForApi } from "@/lib/session";
import { BARCODE_RE, OFF_FIELDS, productToItem, type OffProduct } from "@/lib/nutrition/barcode";

// Offline product for tests (AI_MOCK=1), so e2e never calls Open Food Facts.
const MOCK_PRODUCTS: Record<string, OffProduct> = {
  "9556001234567": {
    product_name: "Chocolate Malt Drink",
    brands: "Test Brand",
    serving_size: "30 g",
    serving_quantity: 30,
    nutriments: { "energy-kcal_100g": 410, proteins_100g: 8, carbohydrates_100g: 70, fat_100g: 9, sugars_100g: 40, sodium_100g: 0.2 },
  },
};

const NOT_FOUND = "That barcode isn't in the Open Food Facts database. Describe the food for an AI estimate, or add it manually.";

async function lookup(code: string): Promise<OffProduct | null> {
  if (process.env.AI_MOCK === "1") return MOCK_PRODUCTS[code] ?? null;
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${OFF_FIELDS}`, {
    // Open Food Facts asks API users to identify their app.
    headers: { "User-Agent": "GymPal/0.1 (personal nutrition tracker)" },
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Open Food Facts returned ${res.status}`);
  const data = (await res.json()) as { status?: number; product?: OffProduct };
  return data.status === 1 && data.product ? data.product : null;
}

export async function GET(request: Request) {
  const user = await getUserForApi();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const code = new URL(request.url).searchParams.get("code")?.trim() ?? "";
  if (!BARCODE_RE.test(code)) return Response.json({ error: "Enter the 8 to 14 digits under the barcode" }, { status: 400 });

  try {
    const product = await lookup(code);
    const item = product ? productToItem(product) : null;
    if (!item) return Response.json({ error: NOT_FOUND }, { status: 404 });
    return Response.json({ item });
  } catch (e) {
    console.error("barcode lookup failed", e);
    return Response.json({ error: "Couldn't reach the food database. Check your connection and try again." }, { status: 502 });
  }
}
