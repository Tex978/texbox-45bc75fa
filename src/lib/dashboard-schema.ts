// Client-safe personal dashboard card catalogue and normalisation (6b).
export const CARD_IDS = ["home", "tasks", "event", "shopping", "menu", "points", "media"] as const;
export type CardId = (typeof CARD_IDS)[number];
export const CARD_LABELS: Record<CardId, string> = {
  home: "Okosotthon és jelenetek",
  tasks: "Mai feladatok",
  event: "Következő program",
  shopping: "Bevásárlás",
  menu: "Mai menü",
  points: "Pontjaim és jutalmak",
  media: "Média és NAS",
};
export type DashboardPrefs = { order: CardId[]; hidden: CardId[]; scenes: string[] };
export type DashKind = "adult" | "child";
export function defaultPrefs(
  kind: DashKind,
  allowed: readonly CardId[] = CARD_IDS,
): DashboardPrefs {
  const order =
    kind === "child"
      ? (["tasks", "points", "event", "menu", "home", "shopping", "media"] as CardId[])
      : [...CARD_IDS];
  return {
    order: order.filter((c) => allowed.includes(c)),
    hidden: kind === "child" ? (["shopping"] as CardId[]).filter((c) => allowed.includes(c)) : [],
    scenes: [],
  };
}
const isCard = (v: unknown): v is CardId => CARD_IDS.includes(v as CardId);
/** Drops unknown/duplicate/forbidden IDs and appends allowed cards that are missing, so new cards appear. */
export function normalizePrefs(
  raw: unknown,
  kind: DashKind,
  allowed: readonly CardId[] = CARD_IDS,
  sceneIds?: readonly string[],
): DashboardPrefs {
  const base = defaultPrefs(kind, allowed);
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = (v: unknown) =>
    [...new Set(Array.isArray(v) ? v.filter(isCard) : [])].filter((c) => allowed.includes(c));
  const order = pick(r["order"]);
  for (const c of base.order) if (!order.includes(c)) order.push(c);
  const scenes = [
    ...new Set(
      Array.isArray(r["scenes"])
        ? r["scenes"].filter(
            (s): s is string => typeof s === "string" && s.length > 0 && s.length <= 100,
          )
        : [],
    ),
  ]
    .filter((s) => !sceneIds || sceneIds.includes(s))
    .slice(0, 12);
  return { order, hidden: Array.isArray(r["hidden"]) ? pick(r["hidden"]) : base.hidden, scenes };
}
export function moveCard(order: CardId[], id: CardId, dir: -1 | 1): CardId[] {
  const i = order.indexOf(id),
    j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return order;
  const next = [...order];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}
