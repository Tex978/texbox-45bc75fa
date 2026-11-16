import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { requirePermission, SESSION_COOKIE } from "./auth.server";
import { adjustPoints, decideRedemption, pointsOverview, redeem, saveReward, setWish } from "./points.server";
import { rewardSchema } from "./points-schema";

function access() {
  const user = requirePermission(getCookie(SESSION_COOKIE));
  if (!user)
    throw new Error(
      "A pontokhoz és az ajándékbolthoz jelentkezz be a saját NAS-címeden. Az előnézet nem ment pontot.",
    );
  return user;
}
const id = z.string().min(1).max(100);
export const pointsList = createServerFn({ method: "GET" }).handler(async () => pointsOverview(access()));
export const pointsAdjust = createServerFn({ method: "POST" })
  .inputValidator((v) =>
    z.object({ person: id, delta: z.number().int(), reason: z.string().max(500), requestId: id }).parse(v),
  )
  .handler(async ({ data }) => adjustPoints(access(), data));
export const rewardSave = createServerFn({ method: "POST" })
  .inputValidator((v) => rewardSchema.parse(v))
  .handler(async ({ data }) => ({ id: saveReward(access(), data) }));
export const rewardRedeem = createServerFn({ method: "POST" })
  .inputValidator((v) =>
    z.object({ rewardId: id, requestId: id, expectedPrice: z.number().int(), person: id.optional() }).parse(v),
  )
  .handler(async ({ data }) => redeem(access(), data));
export const redemptionDecide = createServerFn({ method: "POST" })
  .inputValidator((v) =>
    z
      .object({
        id,
        version: z.number().int(),
        action: z.enum(["approve", "reject", "cancel", "handover"]),
        reason: z.string().max(500).optional(),
      })
      .parse(v),
  )
  .handler(async ({ data }) => decideRedemption(access(), data));
export const rewardWish = createServerFn({ method: "POST" })
  .inputValidator((v) => z.object({ person: id, rewardId: id, wish: z.boolean(), goal: z.boolean() }).parse(v))
  .handler(async ({ data }) => {
    setWish(access(), data);
    return { ok: true };
  });
