/** "smith_machine" → "Smith Machine" */
export const label = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
