import { describe, expect, it } from "vitest";
import { pickProviders, streamParams } from "@/lib/streaming";

describe("streaming", () => {
  it("keeps only known services, ordered by HU priority", () => {
    const r = pickProviders([
      { provider_id: 2, provider_name: "Random TV", display_priorities: { HU: 1 } },
      { provider_id: 337, provider_name: "Disney Plus", display_priorities: { HU: 5 } },
      { provider_id: 8, provider_name: "Netflix", display_priorities: { HU: 2 } },
    ]);
    expect(r.map((p) => p.name)).toEqual(["Netflix", "Disney+"]);
  });
  it("restricts to Hungarian subscription availability and the chosen week", () => {
    const p = streamParams("movie", [8, 337], "new", 7, new Date("2026-11-16T00:00:00Z"));
    expect(p).toMatchObject({ watch_region: "HU", with_watch_providers: "8|337", with_watch_monetization_types: "flatrate", "primary_release_date.gte": "2026-11-09", "primary_release_date.lte": "2026-11-16" });
  });
});
