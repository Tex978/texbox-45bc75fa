import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { routeTree } from "@/routeTree.gen";
import { primaryNav, moreNav, isActiveArea } from "@/components/Shell";

const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
const matches = (p: string) => router.matchRoutes(p).at(-1)?.routeId;
describe("6a navigation", () => {
  it("has exactly five primary areas in the approved order", () => {
    expect(primaryNav.map((n) => n.label)).toEqual([
      "Főoldal",
      "Otthon",
      "Feladatok",
      "Család",
      "Média",
    ]);
  });
  it("keeps every earlier URL routable and reachable from a menu", () => {
    const old = [
      "/",
      "/home",
      "/tasks",
      "/organizer",
      "/rewards",
      "/family",
      "/media",
      "/search",
      "/streaming",
      "/downloads",
      "/library",
      "/settings",
    ];
    for (const p of old) expect(matches(p), p).not.toBe(rootRouteId);
    const linked = new Set<string>([...primaryNav.map((n) => n.to), ...moreNav.map((n) => n.to)]);
    for (const p of old.filter((p) => p !== "/streaming")) expect(linked.has(p), p).toBe(true);
  });
  it("secondary menu never duplicates a primary destination", () => {
    const primary = new Set<string>(primaryNav.map((n) => n.to));
    expect(moreNav.every((n) => !primary.has(n.to))).toBe(true);
  });
  it("highlights the owning area for sub-pages", () => {
    const media = primaryNav.find((n) => n.label === "Média")!.match;
    const family = primaryNav.find((n) => n.label === "Család")!.match;
    expect(isActiveArea("/downloads", media)).toBe(true);
    expect(isActiveArea("/rewards", family)).toBe(true);
    expect(isActiveArea("/home", primaryNav[0]!.match)).toBe(false);
  });
});
