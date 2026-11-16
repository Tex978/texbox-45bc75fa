import { describe, expect, it } from "vitest";
import { discoverParams, matchesAvailability, matchesRaw, needsDiscover, normalizeFilters } from "@/lib/media-filters";

describe("media filters", () => {
  it("keeps only genres valid for the media type", () => {
    expect(normalizeFilters({ genre: 35 }, "Film").genre).toBe(35);
    expect(normalizeFilters({ genre: 10759 }, "Film").genre).toBe(0);
  });
  it("swaps reversed year range", () => {
    const f = normalizeFilters({ yearFrom: 2020, yearTo: 2010 }, "Film");
    expect([f.yearFrom, f.yearTo]).toEqual([2010, 2020]);
  });
  it("builds TMDB discover params for comedy since 2015 rated 7+", () => {
    const p = discoverParams("movie", normalizeFilters({ genre: 35, yearFrom: 2015, minRating: 7 }, "Film"));
    expect(p).toMatchObject({ with_genres: "35", "primary_release_date.gte": "2015-01-01", "vote_average.gte": "7", "vote_count.gte": "100" });
  });
  it("default filters keep the category list", () => {
    expect(needsDiscover(normalizeFilters({}, "Film"))).toBe(false);
  });
  it("filters raw search results", () => {
    const f = normalizeFilters({ genre: 28, yearFrom: 2000 }, "Film");
    expect(matchesRaw({ genre_ids: [28], release_date: "2005-01-01" }, f)).toBe(true);
    expect(matchesRaw({ genre_ids: [35], release_date: "2005-01-01" }, f)).toBe(false);
    expect(matchesRaw({ genre_ids: [28], release_date: "1990-01-01" }, f)).toBe(false);
  });
  it("availability", () => {
    expect(matchesAvailability(true, "missing")).toBe(false);
    expect(matchesAvailability(false, "missing")).toBe(true);
  });
});
