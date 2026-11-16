import { describe, expect, it } from "vitest";
import { mediaPrefStoreKey, normalizeMediaPref } from "@/lib/media-preferences";

describe("Personal media preferences", () => {
  it("isolates family members and legacy preferences", () => {
    expect(mediaPrefStoreKey("adult")).not.toBe(mediaPrefStoreKey("child"));
    expect(mediaPrefStoreKey("adult")).not.toBe(mediaPrefStoreKey(undefined));
  });
  it("retains streaming type/provider/window without inventing values", () => {
    expect(normalizeMediaPref("streaming-state", { type: "Sorozat", provider: 8, mode: "popular", days: 7 })).toEqual({ type: "Sorozat", provider: 8, mode: "popular", days: 7 });
    expect(normalizeMediaPref("streaming-state", { days: 9 })).toMatchObject({ days: 30 });
  });
  it("retains valid search filters", () => {
    expect(normalizeMediaPref("media-search-state", { type: "Film", category: "new", filters: { genre: 35, yearFrom: 2020 } })).toMatchObject({ category: "new", filters: { genre: 35, yearFrom: 2020 } });
  });
});