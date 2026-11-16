/**
 * Utasfelvevő vonat 3–4 éveseknek: a vonat állomásról állomásra megy,
 * és minden állomáson felvesz egy várakozó háziállatot.
 */
export const PASSENGERS = [
  { emoji: "🐶", name: "Kutya", sound: "Vau-vau!" },
  { emoji: "🐱", name: "Cica", sound: "Miaú!" },
  { emoji: "🐮", name: "Tehén", sound: "Múúú!" },
  { emoji: "🐷", name: "Malac", sound: "Röf-röf!" },
  { emoji: "🐴", name: "Ló", sound: "Nyihaha!" },
  { emoji: "🐑", name: "Bárány", sound: "Bee-bee!" },
  { emoji: "🐔", name: "Tyúk", sound: "Kot-kot!" },
  { emoji: "🦆", name: "Kacsa", sound: "Háp-háp!" },
] as const;
export type Passenger = (typeof PASSENGERS)[number];

/** Distinct passengers for one trip, in random order. */
export function makeRoute(count: number, rand: () => number = Math.random): Passenger[] {
  const pool: Passenger[] = [...PASSENGERS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, Math.max(1, Math.min(count, pool.length)));
}
