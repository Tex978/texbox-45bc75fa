import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createUser, createChildProfile, resetAuthDb, type User } from "@/lib/auth.server";
import * as S from "@/lib/points.server";
let parent: User, dir: string, profile: string;
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({ Link: (p: { children: unknown }) => p.children }));
vi.mock("@/lib/points.functions", () => ({
  pointsList: async () => S.pointsOverview(parent),
  pointsAdjust: async ({ data }: { data: Parameters<typeof S.adjustPoints>[1] }) =>
    S.adjustPoints(parent, data),
  rewardSave: async ({ data }: { data: Parameters<typeof S.saveReward>[1] }) => ({
    id: S.saveReward(parent, data),
  }),
  rewardRedeem: async ({ data }: { data: Parameters<typeof S.redeem>[1] }) =>
    S.redeem(parent, data),
  redemptionDecide: async ({ data }: { data: Parameters<typeof S.decideRedemption>[1] }) =>
    S.decideRedemption(parent, data),
  rewardWish: async ({ data }: { data: Parameters<typeof S.setWish>[1] }) =>
    S.setWish(parent, data),
}));
import { Rewards } from "@/components/Rewards";
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "rewards-ui-"));
  process.env["DATA_DIR"] = dir;
  resetAuthDb();
  parent = createUser({ username: "anya", displayName: "Anya", role: "adult" });
  profile = createChildProfile(parent, "Kicsi");
});
afterEach(() => {
  cleanup();
  resetAuthDb();
  rmSync(dir, { recursive: true, force: true });
});
it("parent requests for child (reserve), then approves as a separate step", async () => {
  S.adjustPoints(parent, {
    person: `profile:${profile}`,
    delta: 25,
    reason: "Kezdő",
    requestId: "r1",
  });
  S.saveReward(parent, { name: "Fagyi", price: 20, stock: 3 });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Rewards />
    </QueryClientProvider>,
  );
  fireEvent.change(await screen.findByLabelText("Kinek a pontjai"), {
    target: { value: `profile:${profile}` },
  });
  fireEvent.click(await screen.findByRole("button", { name: /Kérem/ }));
  expect(await screen.findByText(/pontok foglalva/)).toBeTruthy();
  expect(S.balanceOf(`profile:${profile}`)).toMatchObject({ balance: 25, reserved: 20 });
  fireEvent.click(screen.getByRole("tab", { name: /Jóváhagyás/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Jóváhagyás" }));
  expect(await screen.findByText(/Jóváhagyva/)).toBeTruthy();
  expect(S.balanceOf(`profile:${profile}`)).toMatchObject({ balance: 5, reserved: 0 });
});
