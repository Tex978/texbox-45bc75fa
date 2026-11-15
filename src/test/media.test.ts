import { describe, expect, it } from "vitest";
import { filterMedia, imdbIdentifier, imdbScore, mapArrMedia } from "@/lib/media";

describe("Filmkínálat szabályai", () => {
  it("külön választja a filmeket és a sorozatokat", () => {
    const movie = mapArrMedia({ tmdbId: 157336, title: "Interstellar" }, "Film");
    const series = mapArrMedia({ tvdbId: 81189, title: "Breaking Bad" }, "Sorozat");
    expect(filterMedia([movie, series], "Film").map((x) => x.id)).toEqual([157336]);
    expect(filterMedia([movie, series], "Sorozat").map((x) => x.id)).toEqual([81189]);
  });
  it("csak a valódi IMDb mezőből ad pontszámot, TMDB-ből nem", () => {
    expect(mapArrMedia({ tmdbId: 1, ratings: { tmdb: { value: 8.2 } } }, "Film").imdbRating).toBeNull();
    expect(mapArrMedia({ tmdbId: 1, ratings: { imdb: { value: 8.6 } } }, "Film").imdbRating).toBe(8.6);
    expect(imdbScore("N/A")).toBeNull();
  });
  it("a sorozatokhoz Sonarr TVDB azonosítót tart meg", () => {
    const series = mapArrMedia({ tvdbId: 81189, tmdbId: 1396 }, "Sorozat");
    expect(series.id).toBe(81189);
    expect(series.tmdbId).toBe(1396);
  });
  it("csak valódi IMDb-azonosítóhoz ad linkelhető értéket", () => {
    expect(imdbIdentifier("tt0816692")).toBe("tt0816692");
    expect(imdbIdentifier("javascript:alert(1)")).toBeNull();
  });
});