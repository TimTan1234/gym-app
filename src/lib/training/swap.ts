/** What an exercise needs for swap suggestions; library and picker exercises both fit. */
interface SwapCandidate {
  id: string;
  name: string;
  primaryMuscle: string;
  equipment: string;
  category?: string;
}

// Words that name the kit or the position, not the movement: "Dumbbell Row" and "Barbell Row" are both rows.
const NOT_MOVEMENT = new Set(["barbell", "dumbbell", "cable", "machine", "smith", "kettlebell", "seated", "standing", "single", "arm", "one", "the", "with"]);
const movementWords = (name: string) => new Set(name.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2 && !NOT_MOVEMENT.has(w)));

/**
 * Exercises to do instead of `current` when its station is taken: same main muscle, equipment the user
 * has (bodyweight always counts), not already in the workout. Ranked by: the same movement (a row for a
 * row, a press for a press, by the words in the name), then the same kind of lift (compound or
 * isolation), then a different piece of equipment, since the usual reason to swap is that this one is busy.
 */
export function swapOptions<T extends SwapCandidate>(current: T, library: T[], equipment: string[], exclude: Set<string>, limit = 4): T[] {
  const usable = new Set([...equipment, "bodyweight"]);
  const moves = movementWords(current.name);
  const sameMove = (e: T) => [...movementWords(e.name)].some((w) => moves.has(w));
  const score = (e: T) => (sameMove(e) ? 4 : 0) + (e.category && e.category === current.category ? 2 : 0) + (e.equipment !== current.equipment ? 1 : 0);
  return library
    .filter((e) => e.id !== current.id && !exclude.has(e.id) && e.primaryMuscle === current.primaryMuscle && usable.has(e.equipment))
    .map((e, i) => ({ e, i, s: score(e) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map(({ e }) => e);
}
