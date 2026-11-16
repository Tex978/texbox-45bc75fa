import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUser, resetAuthDb, db, updateUser, type User } from "@/lib/auth.server";
import * as S from "@/lib/organizer.server";
import { weekStart, scaleQty, normName } from "@/lib/organizer-schema";
import { balanceOf } from "@/lib/points.server";

let dir: string, dad: User, mom: User, kid: User;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "texbox-org-"));
  process.env["DATA_DIR"] = dir;
  resetAuthDb();
  dad = createUser({ username: "apa", displayName: "Apa", role: "admin" });
  mom = createUser({ username: "anya", displayName: "Anya", role: "adult" });
  kid = createUser({ username: "bence", displayName: "Bence", role: "child" });
});
afterEach(() => {
  resetAuthDb();
  rmSync(dir, { force: true, recursive: true });
});
const main = () => S.shoppingOverview(mom).lists[0]!.id;
const recipeIn = {
  title: "Palacsinta",
  description: "",
  category: "Desszert",
  servings: 4,
  minutes: 30,
  ingredients: [
    { name: "Liszt", qty: 200, unit: "g" },
    { name: "Tojás", qty: 2, unit: "db" },
    { name: "Só", qty: null, unit: "" },
  ],
  steps: ["Összekeverjük", "Kisütjük"],
  image: "",
};

describe("5a shopping list", () => {
  it("backs up, creates one main list, persists items across restart with who added/bought", () => {
    expect(existsSync(join(dir, "backups/pre-organizer-phase5.db"))).toBe(true);
    const list = main();
    expect(S.shoppingOverview(dad).lists).toHaveLength(1);
    const id = S.saveItem(kid, {
      listId: list,
      name: "Tej",
      qty: 2,
      unit: "l",
      store: "Lidl",
      category: "Tejtermék",
    });
    S.checkItem(mom, { id, checked: true });
    S.checkItem(dad, { id, checked: true }); // second phone: idempotent
    resetAuthDb();
    const it0 = S.shoppingOverview(dad).items[0]!;
    expect(it0).toMatchObject({
      name: "Tej",
      qty: 2,
      checked: true,
      addedBy: "Bence",
      checkedBy: "Apa",
      version: 2,
    });
    S.checkItem(mom, { id, checked: false });
    expect(S.shoppingOverview(dad).items[0]).toMatchObject({ checked: false, checkedBy: null });
    expect(db()!.prepare("SELECT count(*) c FROM point_ledger").get()).toEqual({ c: 0 });
    expect(balanceOf(`user:${kid.id}`).balance).toBe(0);
  });
  it("rejects stale edits, invalid input and child list management / foreign deletes", () => {
    const list = main();
    const id = S.saveItem(mom, { listId: list, name: "Kenyér" });
    S.saveItem(dad, { id, version: 1, listId: list, name: "Kenyér (fél)" });
    expect(() => S.saveItem(mom, { id, version: 1, listId: list, name: "Zsemle" })).toThrow(
      "közben",
    );
    expect(() => S.saveItem(mom, { listId: list, name: " " })).toThrow();
    expect(() => S.saveItem(mom, { listId: list, name: "x", qty: -1 })).toThrow();
    expect(() => S.saveItem(mom, { listId: "nope", name: "x" })).toThrow("lista");
    expect(() => S.saveList(kid, { name: "Titkos" })).toThrow("felnőtt");
    expect(() => S.deleteItems(kid, { ids: [id] })).toThrow("saját");
    expect(() => S.saveItem(kid, { id, version: 2, listId: list, name: "Csoki" })).toThrow("saját");
    const own = S.saveItem(kid, { listId: list, name: "Csoki" });
    expect(S.deleteItems(kid, { ids: [own] })).toBe(1);
    const second = S.saveList(mom, { name: "Drogéria" });
    expect(S.shoppingOverview(kid).lists.map((l) => l.id)).toContain(second);
  });
  it("offers frequently bought items from history", () => {
    const list = main();
    for (let i = 0; i < 2; i++) {
      const id = S.saveItem(mom, { listId: list, name: "Banán", unit: "kg" });
      S.deleteItems(mom, { ids: [id] });
    }
    expect(S.shoppingOverview(mom).frequent.map((f) => f.name)).toContain("Banán");
  });
  it("disabled users are refused", () => {
    updateUser(kid.id, { disabled: true });
    expect(() => S.shoppingOverview(kid)).toThrow("Bejelentkezés");
  });
});

describe("5a recipes and weekly menu", () => {
  it("recipe CRUD, archive, child read-only, https-only image", () => {
    const id = S.saveRecipe(mom, recipeIn);
    expect(() => S.saveRecipe(kid, recipeIn)).toThrow("szülő");
    expect(() => S.saveRecipe(mom, { ...recipeIn, image: "javascript:alert(1)" })).toThrow();
    S.saveRecipe(dad, { ...recipeIn, id, version: 1, title: "Amerikai palacsinta" });
    expect(() => S.saveRecipe(mom, { ...recipeIn, id, version: 1 })).toThrow("közben");
    S.saveRecipe(mom, { ...recipeIn, id, version: 2, archived: true });
    resetAuthDb();
    expect(S.listRecipes(kid).recipes[0]).toMatchObject({
      title: "Palacsinta",
      archived: true,
      version: 3,
    });
    expect(S.listRecipes(kid).canEdit).toBe(false);
  });
  it("Budapest week, menu entries, copy previous week with confirmation", () => {
    // 2026-11-15 23:30 UTC is already Monday in Budapest.
    expect(S.menuWeek(mom, undefined, new Date("2026-11-15T23:30:00Z")).start).toBe("2026-11-16");
    expect(weekStart("2026-11-22")).toBe("2026-11-16");
    const r = S.saveRecipe(mom, recipeIn);
    S.saveMenuEntry(mom, { day: "2026-11-17", meal: "vacsora", recipeId: r, servings: 6 });
    S.saveMenuEntry(dad, { day: "2026-11-18", meal: "ebed", title: "Rántott hús" });
    expect(() => S.saveMenuEntry(kid, { day: "2026-11-18", meal: "ebed", title: "Pizza" })).toThrow(
      "felnőtt",
    );
    expect(() => S.saveMenuEntry(mom, { day: "2026-11-18", meal: "ebed" })).toThrow("ételnevet");
    expect(() => S.saveMenuEntry(mom, { day: "2026-02-30", meal: "ebed", title: "x" })).toThrow();
    expect(S.menuWeek(kid, "2026-11-20").entries.map((e) => e.title)).toEqual([
      "Palacsinta",
      "Rántott hús",
    ]);
    expect(S.copyWeek(mom, { from: "2026-11-16", to: "2026-11-23" })).toMatchObject({ copied: 2 });
    expect(S.copyWeek(mom, { from: "2026-11-16", to: "2026-11-23" })).toMatchObject({
      needsConfirm: true,
    });
    expect(S.menuWeek(mom, "2026-11-23").entries.map((e) => e.day)).toEqual([
      "2026-11-24",
      "2026-11-25",
    ]);
  });
  it("adds scaled ingredients, merges only same unit into open items, keeps checked ones, asks confirmation", () => {
    expect(scaleQty(200, 4, 6)).toBe(300);
    expect(normName("  TOJÁS ")).toBe("tojas");
    const list = main(),
      r = S.saveRecipe(mom, recipeIn);
    const egg = S.saveItem(mom, { listId: list, name: "tojas", qty: 10, unit: "db" });
    const flourDone = S.saveItem(mom, { listId: list, name: "Liszt", qty: 1, unit: "kg" });
    S.checkItem(mom, { id: flourDone, checked: true });
    const preview = S.addRecipeToList(mom, { recipeId: r, listId: list, servings: 6 });
    expect(preview).toMatchObject({ needsConfirm: true, merges: ["Tojás"] });
    expect(S.shoppingOverview(mom).items).toHaveLength(2);
    expect(
      S.addRecipeToList(mom, { recipeId: r, listId: list, servings: 6, confirm: true }),
    ).toMatchObject({ added: 2, merged: 1 });
    const items = S.shoppingOverview(mom).items;
    expect(items.find((i) => i.id === egg)?.qty).toBe(13);
    expect(items.find((i) => i.id === flourDone)).toMatchObject({ checked: true, qty: 1 });
    expect(items.find((i) => i.name === "Liszt" && !i.checked)).toMatchObject({
      qty: 300,
      unit: "g",
    });
    expect(() => S.addRecipeToList(kid, { recipeId: r, listId: list, servings: 2 })).toThrow(
      "felnőtt",
    );
    expect(() => S.addRecipeToList(mom, { recipeId: r, listId: list, servings: 0 })).toThrow();
  });
});
