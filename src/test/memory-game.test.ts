import { expect, it } from "vitest";
import { buildDeck } from "@/lib/memory-game";
it("every animal appears exactly twice", () => {
  for (const p of [3, 4, 6]) {
    const d = buildDeck(p);
    expect(d).toHaveLength(p * 2);
    const c: Record<string, number> = {};
    d.forEach((x) => (c[x.emoji] = (c[x.emoji] ?? 0) + 1));
    expect(Object.values(c).every((n) => n === 2)).toBe(true);
  }
});
