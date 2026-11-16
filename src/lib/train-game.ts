/**
 * Vonatos játék 3–4 éveseknek: két mini játék egy modulban.
 * - "Állomások": a gyerek a vonat színéhez tartozó állomást nyomja meg.
 * - "Kocsi rakodása": a gyerek annyi kocsit rak, amennyit a felirat kér.
 * Minden függvény tiszta (időt és véletlent paraméterül kap), hogy tesztelhető legyen.
 */

export type TrainColor = {
  /** Nominative form, e.g. "Piros". */
  name: string;
  /** Allative form used in prompts, e.g. "pirosra". */
  allative: string;
  /** Decorative game-piece colour. */
  hex: string;
};

export const TRAIN_COLORS: TrainColor[] = [
  { name: "Piros", allative: "pirosra", hex: "#dc2626" },
  { name: "Kék", allative: "kékbe", hex: "#2563eb" },
  { name: "Zöld", allative: "zöldbe", hex: "#16a34a" },
  { name: "Sárga", allative: "sárgába", hex: "#eab308" },
  { name: "Lila", allative: "lilába", hex: "#9333ea" },
  { name: "Narancs", allative: "narancsba", hex: "#ea580c" },
];

export const WAGON_NAME = "teherkocsi";
export const WAGON_ALLATIVE = "teherkocsira";

export type Train = { colorIndex: number; wagons: number };

/** Station option: which colour platform the child may tap. */
export type Station = { colorIndex: number; label: string; hex: string };

/** Clamps any rand() result into [0,1) so a 1 or a negative value cannot break the range. */
function unit(rand: () => number): number {
  const r = rand();
  if (!(r >= 0) || r >= 1) return 0;
  return r;
}

export function pickColor(count: number, rand: () => number): number {
  const n = Math.max(1, Math.min(count, TRAIN_COLORS.length));
  return Math.min(TRAIN_COLORS.length - 1, Math.floor(unit(rand) * n));
}

/** A train with a colour and 1..maxWagons wagons; the count drives the loading game. */
export function makeTrain(rand: () => number, maxWagons = 4): Train {
  const max = Math.max(1, Math.min(maxWagons, 9));
  return {
    colorIndex: pickColor(TRAIN_COLORS.length, rand),
    wagons: 1 + Math.floor(unit(rand) * max),
  };
}

/**
 * Builds the station buttons: the train's own colour plus `count - 1` distinct
 * distractors, shuffled, so the matching platform is never in a fixed place.
 */
export function pickStations(train: Train, count: number, rand: () => number): Station[] {
  const total = Math.max(2, Math.min(count, TRAIN_COLORS.length));
  const chosen = new Set<number>([train.colorIndex]);
  while (chosen.size < total) chosen.add(pickColor(TRAIN_COLORS.length, rand));
  const list = [...chosen].map((i) => ({
    colorIndex: i,
    label: TRAIN_COLORS[i]!.name,
    hex: TRAIN_COLORS[i]!.hex,
  }));
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(unit(rand) * (i + 1));
    [list[i], list[j]] = [list[j]!, list[i]!];
  }
  return list;
}

export function isCorrectStation(train: Train, station: Station): boolean {
  return train.colorIndex === station.colorIndex;
}

/** How many wagons the loading round asks for (never more than the train can show). */
export function makeCargoTarget(rand: () => number, maxWagons = 4): number {
  const max = Math.max(1, Math.min(maxWagons, 9));
  return 1 + Math.floor(unit(rand) * max);
}

export function isCargoFull(target: number, loaded: number): boolean {
  return loaded >= Math.max(1, target);
}
