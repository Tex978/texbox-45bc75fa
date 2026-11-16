import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { requirePermission, SESSION_COOKIE } from "./auth.server";
import * as S from "./organizer.server";
import { itemSchema, menuSchema, recipeSchema } from "./organizer-schema";

function access() {
  const user = requirePermission(getCookie(SESSION_COOKIE));
  if (!user)
    throw new Error(
      "A családi szervezőhöz jelentkezz be a saját NAS-címeden. Az előnézet nem ment listát, receptet vagy menüt.",
    );
  return user;
}
const id = z.string().min(1).max(100);
export const shopList = createServerFn({ method: "GET" }).handler(async () =>
  S.shoppingOverview(access()),
);
export const shopSaveList = createServerFn({ method: "POST" })
  .inputValidator((v) =>
    z
      .object({
        id: id.optional(),
        name: z.string().max(60),
        archived: z.boolean().optional(),
        version: z.number().int().optional(),
      })
      .parse(v),
  )
  .handler(async ({ data }) => ({ id: S.saveList(access(), data) }));
export const shopSaveItem = createServerFn({ method: "POST" })
  .inputValidator((v) => itemSchema.parse(v))
  .handler(async ({ data }) => ({ id: S.saveItem(access(), data) }));
export const shopCheck = createServerFn({ method: "POST" })
  .inputValidator((v) => z.object({ id, checked: z.boolean() }).parse(v))
  .handler(async ({ data }) => {
    S.checkItem(access(), data);
    return { ok: true };
  });
export const shopDelete = createServerFn({ method: "POST" })
  .inputValidator((v) => z.object({ ids: z.array(id).min(1).max(500) }).parse(v))
  .handler(async ({ data }) => {
    S.deleteItems(access(), data);
    return { ok: true };
  });
export const recipesList = createServerFn({ method: "GET" }).handler(async () =>
  S.listRecipes(access()),
);
export const recipeSave = createServerFn({ method: "POST" })
  .inputValidator((v) => recipeSchema.extend({ archived: z.boolean().optional() }).parse(v))
  .handler(async ({ data }) => ({ id: S.saveRecipe(access(), data) }));
export const menuGet = createServerFn({ method: "GET" })
  .inputValidator((v) => z.object({ date: z.string().max(10).optional() }).parse(v ?? {}))
  .handler(async ({ data }) => S.menuWeek(access(), data.date));
export const menuAdd = createServerFn({ method: "POST" })
  .inputValidator((v) => menuSchema.parse(v))
  .handler(async ({ data }) => ({ id: S.saveMenuEntry(access(), data) }));
export const menuRemove = createServerFn({ method: "POST" })
  .inputValidator((v) => z.object({ id }).parse(v))
  .handler(async ({ data }) => {
    S.deleteMenuEntry(access(), data.id);
    return { ok: true };
  });
export const menuCopy = createServerFn({ method: "POST" })
  .inputValidator((v) =>
    z
      .object({ from: z.string().max(10), to: z.string().max(10), confirm: z.boolean().optional() })
      .parse(v),
  )
  .handler(async ({ data }) => S.copyWeek(access(), data));
export const recipeToList = createServerFn({ method: "POST" })
  .inputValidator((v) =>
    z
      .object({
        recipeId: id,
        listId: id,
        servings: z.number().int(),
        confirm: z.boolean().optional(),
      })
      .parse(v),
  )
  .handler(async ({ data }) => S.addRecipeToList(access(), data));
