export const FARM_ANIMALS = [
  { emoji: "🐶", name: "Kutya" },
  { emoji: "🐱", name: "Cica" },
  { emoji: "🐮", name: "Tehén" },
  { emoji: "🐷", name: "Malac" },
  { emoji: "🐴", name: "Ló" },
  { emoji: "🐑", name: "Bárány" },
  { emoji: "🐔", name: "Tyúk" },
  { emoji: "🐰", name: "Nyuszi" },
] as const;
export type MemoryCard = { id: number; emoji: string; name: string };
/** Builds a shuffled deck with exactly two cards per chosen animal. */
export function buildDeck(pairs: number, rand: () => number = Math.random): MemoryCard[] {
  const n = Math.max(2, Math.min(pairs, FARM_ANIMALS.length));
  const pool = [...FARM_ANIMALS].sort(() => rand() - 0.5).slice(0, n);
  const deck = pool.flatMap((a) => [a, a]).map((a, id) => ({ id, ...a }));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
