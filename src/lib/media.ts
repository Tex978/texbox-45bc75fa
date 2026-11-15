export type MediaType = "Film" | "Sorozat";
export type MediaCategory = "recommended" | "new" | "popular" | "trending";
export type MediaItem = {
  id: number; tmdbId?: number | undefined; type: MediaType; title: string; year: number; poster: string;
  overview: string; inLibrary: boolean; imdbId: string | null; imdbRating: number | null;
};
export type MediaDetail = MediaItem & {
  genres: string[]; runtime: number | null; cast: { name: string; character: string; photo: string }[];
  images: string[]; trailers: { name: string; key: string }[]; demo: boolean; notice: string;
};
export function imdbScore(value: unknown): number | null {
  const score = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof score === "number" && Number.isFinite(score) && score > 0 && score <= 10 ? score : null;
}
export function imdbIdentifier(value: unknown): string | null {
  return typeof value === "string" && /^tt\d{7,10}$/.test(value) ? value : null;
}
export function mapArrMedia(x: Record<string, any>, type: MediaType): MediaItem {
  return {
    id: type === "Film" ? x["tmdbId"] : x["tvdbId"], tmdbId: x["tmdbId"] || undefined, type, title: x["title"] || "Névtelen",
    year: x["year"] || 0, poster: x["remotePoster"] || x["images"]?.find((i: any) => i.coverType === "poster")?.remoteUrl || "",
    overview: x["overview"] || "", inLibrary: !!x["id"] || !!x["isExisting"],
    imdbId: imdbIdentifier(x["imdbId"]), imdbRating: imdbScore(x["ratings"]?.imdb?.value),
  };
}
export function filterMedia(items: MediaItem[], type: MediaType, query = ""): MediaItem[] {
  return items.filter((item) => item.type === type && item.title.toLocaleLowerCase("hu").includes(query.toLocaleLowerCase("hu")));
}