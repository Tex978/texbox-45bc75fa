import { expect, it } from "vitest";
import { PASSENGERS, makeRoute } from "@/lib/train-game";

it("a menet annyi különböző utast ad, amennyit kérünk", () => {
  const r = makeRoute(5, () => 0.3);
  expect(r).toHaveLength(5);
  expect(new Set(r.map((p) => p.name)).size).toBe(5);
});
it("a menet hossza 1 és az összes állat között marad", () => {
  expect(makeRoute(0)).toHaveLength(1);
  expect(makeRoute(99)).toHaveLength(PASSENGERS.length);
});
