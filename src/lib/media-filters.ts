import type { MediaType } from "./media";

export type MediaSort = "popularity" | "rating" | "newest";
export type Availability = "all" | "library" | "missing";
export type MediaFilters = { genre: number; yearFrom: number; yearTo: number; minRating: number; sort: MediaSort; availability: Availability };
export const DEFAULT_FILTERS: MediaFilters = { genre: 0, yearFrom: 0, yearTo: 0, minRating: 0, sort: "popularity", availability: "all" };

/** TMDB genre IDs (official, stable) with Hungarian labels. */
export const GENRES: Record<MediaType, { id: number; name: string }[]> = {
  Film: [
    { id: 28, name: "Akció" }, { id: 12, name: "Kaland" }, { id: 16, name: "Animáció" }, { id: 35, name: "Vígjáték" },
    { id: 80, name: "Bűnügyi" }, { id: 99, name: "Dokumentum" }, { id: 18, name: "Dráma" }, { id: 10751, name: "Családi" },
    { id: 14, name: "Fantasy" }, { id: 36, name: "Történelmi" }, { id: 27, name: "Horror" }, { id: 10402, name: "Zenés" },
    { id: 9648, name: "Rejtély" }, { id: 10749, name: "Romantikus" }, { id: 878, name: "Sci-fi" }, { id: 53, name: "Thriller" },
    { id: 10752, name: "Háborús" }, { id: 37, name: "Western" },
  ],
  Sorozat: [
    { id: 10759, name: "Akció és kaland" }, { id: 16, name: "Animáció" }, { id: 35, name: "Vígjáték" }, { id: 80, name: "Bűnügyi" },
    { id: 99, name: "Dokumentum" }, { id: 18, name: "Dráma" }, { id: 10751, name: "Családi" }, { id: 10762, name: "Gyerek" },
    { id: 9648, name: "Rejtély" }, { id: 10765, name: "Sci-fi és fantasy" }, { id: 10764, name: "Valóságshow" },
    { id: 10768, name: "Háborús és politikai" }, { id: 37, name: "Western" },
  ],
};

const int = (v: unknown, min: number, max: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : 0;
};
export function normalizeFilters(f: Partial<MediaFilters> | undefined, type: MediaType): MediaFilters {
  const genre = int(f?.genre, 1, 99999);
  let yearFrom = int(f?.yearFrom, 1900, 2100), yearTo = int(f?.yearTo, 1900, 2100);
  if (yearFrom && yearTo && yearFrom > yearTo) [yearFrom, yearTo] = [yearTo, yearFrom];
  const rating = Number(f?.minRating);
  return {
    genre: GENRES[type].some((g) => g.id === genre) ? genre : 0, yearFrom, yearTo,
    minRating: Number.isFinite(rating) && rating > 0 && rating <= 9 ? Math.round(rating) : 0,
    sort: f?.sort === "rating" || f?.sort === "newest" ? f.sort : "popularity",
    availability: f?.availability === "library" || f?.availability === "missing" ? f.availability : "all",
  };
}
/** True when TMDB discovery must be used instead of the category list. */
export const needsDiscover = (f: MediaFilters) => !!(f.genre || f.yearFrom || f.yearTo || f.minRating || f.sort !== "popularity");
export const activeCount = (f: MediaFilters) =>
  [f.genre, f.yearFrom || f.yearTo, f.minRating, f.sort !== "popularity", f.availability !== "all"].filter(Boolean).length;

export function discoverParams(kind: "movie" | "tv", f: MediaFilters): Record<string, string> {
  const date = kind === "movie" ? "primary_release_date" : "first_air_date";
  const p: Record<string, string> = {
    sort_by: f.sort === "rating" ? "vote_average.desc" : f.sort === "newest" ? `${date}.desc` : "popularity.desc",
  };
  if (f.genre) p["with_genres"] = String(f.genre);
  if (f.yearFrom) p[`${date}.gte`] = `${f.yearFrom}-01-01`;
  if (f.yearTo) p[`${date}.lte`] = `${f.yearTo}-12-31`;
  if (f.minRating) p["vote_average.gte"] = String(f.minRating);
  // Rating sorts and thresholds need enough votes, otherwise single-vote titles dominate.
  if (f.minRating || f.sort === "rating") p["vote_count.gte"] = "100";
  if (f.sort === "newest" && !f.yearTo) p[`${date}.lte`] = new Date().toISOString().slice(0, 10);
  return p;
}
/** Applies filters to raw TMDB results where the endpoint (e.g. text search) cannot. */
export function matchesRaw(x: { genre_ids?: number[]; release_date?: string; first_air_date?: string; vote_average?: number }, f: MediaFilters) {
  const year = Number((x.release_date || x.first_air_date || "").slice(0, 4));
  if (f.genre && !(x.genre_ids ?? []).includes(f.genre)) return false;
  if (f.yearFrom && (!year || year < f.yearFrom)) return false;
  if (f.yearTo && (!year || year > f.yearTo)) return false;
  if (f.minRating && !((x.vote_average ?? 0) >= f.minRating)) return false;
  return true;
}
export function matchesAvailability(inLibrary: boolean, a: Availability) {
  return a === "all" || (a === "library" ? inLibrary : !inLibrary);
}
