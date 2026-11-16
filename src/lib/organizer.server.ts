import { db, getUser, userCan, type User } from "./auth.server";
import { addDays, budapestToday, dateSchema } from "./task-schema";
import {
  itemSchema,
  menuSchema,
  normName,
  normUnit,
  recipeSchema,
  scaleQty,
  weekStart,
  type ItemInput,
  type RecipeInput,
} from "./organizer-schema";

// Family organizer: every signed-in active member reads; children may add/check shopping items only.
const store = () => {
  const d = db();
  if (!d)
    throw new Error(
      "A családi szervező csak a saját Synology NAS-on ment; az előnézet nem éri el a listákat.",
    );
  return d;
};
function current(user: User) {
  const u = getUser(user.id);
  if (!u || u.disabled) throw new Error("Bejelentkezés szükséges.");
  return u;
}
const isParent = (u: User) => u.role !== "child" && userCan(u, "family");
const isAdult = (u: User) => u.role !== "child";
function tx<T>(fn: () => T): T {
  const d = store();
  d.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    d.exec("COMMIT");
    return r;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}
const nameOf = (id: string | null) => (id ? (getUser(id)?.displayName ?? "Korábbi családtag") : null);
type ItemRow = {
  id: string; list_id: string; name: string; norm: string; qty: number | null; unit: string; store: string;
  category: string; note: string; checked: number; added_by: string; checked_by: string | null; version: number; updated_at: number;
};
const itemOut = (r: ItemRow) => ({
  id: r.id, listId: r.list_id, name: r.name, qty: r.qty, unit: r.unit, store: r.store, category: r.category,
  note: r.note, checked: !!r.checked, addedBy: nameOf(r.added_by), checkedBy: nameOf(r.checked_by), version: r.version,
});
function ensureDefaultList(u: User) {
  const d = store();
  if (!d.prepare("SELECT 1 FROM shop_lists LIMIT 1").get())
    d.prepare("INSERT INTO shop_lists VALUES(?,?,0,1,?,?)").run(crypto.randomUUID(), "Fő bevásárlólista", u.id, Date.now());
}
function list(id: string) {
  const r = store().prepare("SELECT * FROM shop_lists WHERE id=?").get(id) as { id: string; archived: number } | undefined;
  if (!r || r.archived) throw new Error("A lista nem található vagy archivált.");
  return r;
}

export function shoppingOverview(user: User) {
  return tx(() => {
    const u = current(user);
    ensureDefaultList(u);
    const d = store();
    const lists = d.prepare("SELECT id,name,version FROM shop_lists WHERE archived=0 ORDER BY created_at").all() as { id: string; name: string; version: number }[];
    const items = (d.prepare("SELECT * FROM shop_items WHERE deleted=0 ORDER BY checked,category,name").all() as ItemRow[]).map(itemOut);
    // Frequently bought: by history count, excluding what is already open on a list.
    const frequent = d
      .prepare(
        "SELECT name,unit,store,category,count(*) n FROM shop_items GROUP BY norm HAVING n>=2 ORDER BY n DESC,max(updated_at) DESC LIMIT 20",
      )
      .all() as { name: string; unit: string; store: string; category: string; n: number }[];
    return { lists, items, frequent, canManageLists: isAdult(u), at: Date.now() };
  });
}
export function saveList(user: User, input: { id?: string | undefined; name: string; archived?: boolean | undefined; version?: number | undefined }) {
  return tx(() => {
    const u = current(user);
    if (!isAdult(u)) throw new Error("Listát csak felnőtt hozhat létre vagy archiválhat.");
    const name = input.name.trim();
    if (!name || name.length > 60) throw new Error("A lista neve 1–60 karakter lehet.");
    if (!input.id) {
      const id = crypto.randomUUID();
      store().prepare("INSERT INTO shop_lists VALUES(?,?,0,1,?,?)").run(id, name, u.id, Date.now());
      return id;
    }
    if (!store().prepare("UPDATE shop_lists SET name=?,archived=?,version=version+1 WHERE id=? AND version=?").run(name, input.archived ? 1 : 0, input.id, input.version ?? -1).changes)
      throw new Error("A listát közben módosították. Töltsd újra.");
    return input.id;
  });
}
export function saveItem(user: User, raw: ItemInput) {
  return tx(() => {
    const u = current(user),
      i = itemSchema.parse(raw),
      now = Date.now();
    list(i.listId);
    if (!i.id) {
      const id = crypto.randomUUID();
      store()
        .prepare("INSERT INTO shop_items(id,list_id,name,norm,qty,unit,store,category,note,added_by,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,1,?,?)")
        .run(id, i.listId, i.name, normName(i.name), i.qty, i.unit, i.store, i.category, i.note, u.id, now, now);
      return id;
    }
    const owner = store().prepare("SELECT added_by FROM shop_items WHERE id=?").get(i.id) as { added_by: string } | undefined;
    if (!isAdult(u) && owner && owner.added_by !== u.id) throw new Error("Gyerek csak a saját tételét szerkesztheti.");
    if (
      !store()
        .prepare("UPDATE shop_items SET list_id=?,name=?,norm=?,qty=?,unit=?,store=?,category=?,note=?,version=version+1,updated_at=? WHERE id=? AND version=? AND deleted=0")
        .run(i.listId, i.name, normName(i.name), i.qty, i.unit, i.store, i.category, i.note, now, i.id, i.version ?? -1).changes
    )
      throw new Error("A terméket közben módosították vagy törölték. Töltsd újra.");
    return i.id;
  });
}
/** Idempotent: two phones ticking the same item both succeed with one consistent result. */
export function checkItem(user: User, input: { id: string; checked: boolean }) {
  return tx(() => {
    const u = current(user);
    const r = store()
      .prepare("UPDATE shop_items SET checked=?,checked_by=?,version=version+(checked<>?),updated_at=? WHERE id=? AND deleted=0")
      .run(input.checked ? 1 : 0, input.checked ? u.id : null, input.checked ? 1 : 0, Date.now(), input.id);
    if (!r.changes) throw new Error("A termék már nincs a listán.");
  });
}
export function deleteItems(user: User, input: { ids: string[] }) {
  return tx(() => {
    const u = current(user);
    // Children may only remove what they added themselves.
    const s = store().prepare(
      isAdult(u)
        ? "UPDATE shop_items SET deleted=1,updated_at=? WHERE id=? AND ?<>''"
        : "UPDATE shop_items SET deleted=1,updated_at=? WHERE id=? AND added_by=?",
    );
    let n = 0;
    for (const id of input.ids.slice(0, 500)) n += Number(s.run(Date.now(), id, u.id).changes);
    if (!n) throw new Error("Nincs törölhető termék (gyerek csak a saját tételét törölheti).");
    return n;
  });
}

type RecipeRow = { id: string; body: string; archived: number; version: number; created_by: string };
const recipeOut = (r: RecipeRow) => ({ ...recipeSchema.parse(JSON.parse(r.body)), id: r.id, version: r.version, archived: !!r.archived });
function recipe(id: string) {
  const r = store().prepare("SELECT * FROM recipes WHERE id=?").get(id) as RecipeRow | undefined;
  if (!r) throw new Error("A recept nem található.");
  return recipeOut(r);
}
export function listRecipes(user: User) {
  const u = current(user);
  return {
    canEdit: isParent(u),
    recipes: (store().prepare("SELECT * FROM recipes ORDER BY archived,updated_at DESC").all() as RecipeRow[]).map(recipeOut),
  };
}
export function saveRecipe(user: User, raw: RecipeInput & { archived?: boolean }) {
  return tx(() => {
    const u = current(user);
    if (!isParent(u)) throw new Error("Receptet csak jogosult szülő szerkeszthet.");
    const r = recipeSchema.parse(raw),
      body = JSON.stringify({ ...r, id: undefined, version: undefined });
    if (!r.id) {
      const id = crypto.randomUUID();
      store().prepare("INSERT INTO recipes VALUES(?,?,0,1,?,?)").run(id, body, u.id, Date.now());
      return id;
    }
    if (!store().prepare("UPDATE recipes SET body=?,archived=?,version=version+1,updated_at=? WHERE id=? AND version=?").run(body, raw.archived ? 1 : 0, Date.now(), r.id, r.version ?? -1).changes)
      throw new Error("A receptet közben módosították. Töltsd újra.");
    return r.id;
  });
}

export function menuWeek(user: User, date?: string, now = new Date()) {
  const u = current(user),
    start = weekStart(date ? dateSchema.parse(date) : budapestToday(now));
  const entries = store()
    .prepare("SELECT * FROM menu_entries WHERE day>=? AND day<=? ORDER BY day,meal")
    .all(start, addDays(start, 6)) as { id: string; day: string; meal: string; recipe_id: string | null; title: string; servings: number }[];
  return {
    start,
    today: budapestToday(now),
    canEdit: isAdult(u),
    entries: entries.map((e) => ({ id: e.id, day: e.day, meal: e.meal, recipeId: e.recipe_id, title: e.title, servings: e.servings })),
  };
}
export function saveMenuEntry(user: User, raw: unknown) {
  return tx(() => {
    const u = current(user);
    if (!isAdult(u)) throw new Error("A heti menüt felnőtt szerkesztheti.");
    const m = menuSchema.parse(raw);
    let title = m.title;
    if (m.recipeId) {
      const r = recipe(m.recipeId);
      if (r.archived) throw new Error("Archivált receptet nem lehet betervezni.");
      title ||= r.title;
    }
    if (!title) throw new Error("Válassz receptet vagy írj ételnevet.");
    const id = crypto.randomUUID();
    store().prepare("INSERT INTO menu_entries VALUES(?,?,?,?,?,?,?,?)").run(id, m.day, m.meal, m.recipeId, title, m.servings, u.id, Date.now());
    return id;
  });
}
export function deleteMenuEntry(user: User, id: string) {
  return tx(() => {
    if (!isAdult(current(user))) throw new Error("A heti menüt felnőtt szerkesztheti.");
    store().prepare("DELETE FROM menu_entries WHERE id=?").run(id);
  });
}
export function copyWeek(user: User, input: { from: string; to: string; confirm?: boolean | undefined }) {
  return tx(() => {
    const u = current(user);
    if (!isAdult(u)) throw new Error("A heti menüt felnőtt szerkesztheti.");
    const from = weekStart(dateSchema.parse(input.from)),
      to = weekStart(dateSchema.parse(input.to));
    if (from === to) throw new Error("Válassz másik hetet.");
    const d = store();
    const existing = (d.prepare("SELECT count(*) c FROM menu_entries WHERE day>=? AND day<=?").get(to, addDays(to, 6)) as { c: number }).c;
    if (existing && !input.confirm) return { needsConfirm: true, copied: 0 };
    const rows = d.prepare("SELECT * FROM menu_entries WHERE day>=? AND day<=?").all(from, addDays(from, 6)) as { day: string; meal: string; recipe_id: string | null; title: string; servings: number }[];
    const shift = Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
    const ins = d.prepare("INSERT INTO menu_entries VALUES(?,?,?,?,?,?,?,?)");
    for (const r of rows) ins.run(crypto.randomUUID(), addDays(r.day, shift), r.meal, r.recipe_id, r.title, r.servings, u.id, Date.now());
    return { needsConfirm: false, copied: rows.length };
  });
}
/**
 * Adds scaled recipe ingredients to a list. Same name+unit merges into an OPEN item only;
 * checked items keep their state and a new row is added. Without confirm, merges are only previewed.
 */
export function addRecipeToList(user: User, input: { recipeId: string; listId: string; servings: number; confirm?: boolean | undefined }) {
  return tx(() => {
    const u = current(user);
    if (!isAdult(u)) throw new Error("Hozzávalókat felnőtt tehet a listára.");
    list(input.listId);
    const r = recipe(input.recipeId);
    if (!Number.isInteger(input.servings) || input.servings < 1 || input.servings > 50) throw new Error("Az adagszám 1–50 lehet.");
    const d = store(),
      now = Date.now();
    const plan = r.ingredients.map((ing) => {
      const qty = scaleQty(ing.qty, r.servings, input.servings);
      const match = d
        .prepare("SELECT * FROM shop_items WHERE list_id=? AND deleted=0 AND checked=0 AND norm=?")
        .all(input.listId, normName(ing.name)) as ItemRow[];
      const same = match.find((m) => normUnit(m.unit) === normUnit(ing.unit) && (m.qty === null) === (qty === null));
      return { ing, qty, same };
    });
    const merges = plan.filter((p) => p.same).map((p) => p.ing.name);
    if (merges.length && !input.confirm) return { needsConfirm: true, merges, added: 0, merged: 0 };
    let added = 0,
      merged = 0;
    for (const p of plan) {
      if (p.same) {
        if (p.qty !== null && p.same.qty !== null)
          d.prepare("UPDATE shop_items SET qty=?,version=version+1,updated_at=? WHERE id=?").run(Math.round((p.same.qty + p.qty) * 100) / 100, now, p.same.id);
        merged++;
      } else {
        d.prepare("INSERT INTO shop_items(id,list_id,name,norm,qty,unit,store,category,note,added_by,version,created_at,updated_at) VALUES(?,?,?,?,?,?,'','',?,?,1,?,?)")
          .run(crypto.randomUUID(), input.listId, p.ing.name, normName(p.ing.name), p.qty, p.ing.unit, `Recept: ${r.title}`.slice(0, 200), u.id, now, now);
        added++;
      }
    }
    return { needsConfirm: false, merges, added, merged };
  });
}
