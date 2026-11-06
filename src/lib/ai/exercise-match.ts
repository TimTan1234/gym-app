/** The exercise ids for the slugs the AI picked: known ones only, each once, best first, at most 5. */
export function matchedExerciseIds(slugs: string[], library: { id: string; slug: string }[]): string[] {
  const bySlug = new Map(library.map((e) => [e.slug, e.id]));
  const ids = slugs.map((s) => bySlug.get(s)).filter((id): id is string => !!id);
  return [...new Set(ids)].slice(0, 5);
}
