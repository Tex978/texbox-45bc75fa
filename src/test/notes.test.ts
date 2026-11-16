import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createUser,
  createChildProfile,
  createSession,
  resetAuthDb,
  db,
  type User,
} from "@/lib/auth.server";
import { itemHistory, listItems, matterToTask, saveItem, setArchived } from "@/lib/notes.server";
import { saveTask } from "@/lib/tasks.server";
import { balanceOf } from "@/lib/points.server";
import type { FamilyItemInput } from "@/lib/notes-schema";
const context = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    inputValidator(v: (x: unknown) => unknown) {
      this.v = v;
      return this;
    },
    v: (x: unknown) => x,
    handler(fn: (a: { data: unknown }) => unknown) {
      const v = this.v;
      return (a?: { data: unknown }) => fn({ data: v(a?.data) });
    },
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getCookie: () => context.token }));
import { notesList, noteSave, noteArchive, matterTask } from "@/lib/notes.functions";

let dir: string, dad: User, mom: User, kid: User, profile: string;
const note = (p: Partial<FamilyItemInput> = {}) =>
  ({
    kind: "note",
    title: "Wifi helye",
    content: "A router a polcon.",
    category: "Otthon",
    visibility: "personal",
    childVisible: false,
    pinned: false,
    url: "",
    checklist: [],
    ...p,
  }) as FamilyItemInput;
const matter = (p: Record<string, unknown> = {}) =>
  ({
    kind: "matter",
    title: "Kazán szerviz",
    content: "",
    category: "Karbantartás",
    visibility: "family",
    childVisible: false,
    pinned: false,
    url: "",
    assignee: null,
    due: "2026-12-01",
    status: "planned",
    priority: "high",
    ...p,
  }) as FamilyItemInput;
const titles = (u: User, archived = false) => listItems(u, { archived }).items.map((i) => i.title);
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "texbox-notes-"));
  process.env["DATA_DIR"] = dir;
  resetAuthDb();
  context.token = undefined;
  dad = createUser({ username: "apa", displayName: "Apa", role: "admin" });
  mom = createUser({ username: "anya", displayName: "Anya", role: "adult" });
  kid = createUser({ username: "bence", displayName: "Bence", role: "child" });
  profile = createChildProfile(mom, "Kicsi");
});
afterEach(() => {
  resetAuthDb();
  rmSync(dir, { force: true, recursive: true });
});
describe("8a family notes and matters", () => {
  it("snapshots before additive tables and persists across restart", () => {
    expect(existsSync(join(dir, "backups/pre-family-notes-phase8a.db"))).toBe(true);
    saveItem(mom, note());
    resetAuthDb();
    expect(titles(mom)).toEqual(["Wifi helye"]);
  });
  it("private notes stay private between two adults; children only see explicitly shared", () => {
    saveItem(mom, note({ title: "Anya privát" }));
    saveItem(dad, note({ title: "Apa privát" }));
    saveItem(mom, note({ title: "Felnőtt közös", visibility: "family" }));
    saveItem(mom, note({ title: "Gyerekeknek", visibility: "family", childVisible: true }));
    expect(titles(mom).sort()).toEqual(["Anya privát", "Felnőtt közös", "Gyerekeknek"]);
    expect(titles(dad).sort()).toEqual(["Apa privát", "Felnőtt közös", "Gyerekeknek"]);
    expect(titles(kid)).toEqual(["Gyerekeknek"]);
    expect(() => saveItem(kid, note())).toThrow("felnőtt");
    expect(() => saveItem(mom, note({ childVisible: true }))).toThrow("gyerekkel");
  });
  it("foreign IDs cannot be edited, archived or read via history", () => {
    const id = saveItem(mom, note());
    expect(() => saveItem(dad, { ...note({ title: "x" }), id, version: 1 })).toThrow(
      "nem szerkesztheted",
    );
    expect(() => setArchived(dad, { id, version: 1, archived: true })).toThrow();
    expect(() => itemHistory(dad, id)).toThrow("nem található");
    expect(() => itemHistory(kid, "nope")).toThrow();
  });
  it("revision conflict between two phones; parents co-edit family items but only owner changes visibility", () => {
    const id = saveItem(mom, note({ visibility: "family" }));
    saveItem(dad, { ...note({ visibility: "family", title: "Apa javította" }), id, version: 1 });
    expect(() =>
      saveItem(mom, { ...note({ visibility: "family", title: "Régi" }), id, version: 1 }),
    ).toThrow("módosította");
    expect(() =>
      saveItem(dad, { ...note({ visibility: "family", childVisible: true }), id, version: 2 }),
    ).toThrow("létrehozó");
    expect(listItems(mom).items[0]).toMatchObject({
      title: "Apa javította",
      updatedByName: "Apa",
      version: 2,
    });
  });
  it("archive and restore keep data and audit", () => {
    const id = saveItem(mom, note());
    setArchived(mom, { id, version: 1, archived: true });
    expect(titles(mom)).toEqual([]);
    expect(titles(mom, true)).toEqual(["Wifi helye"]);
    setArchived(mom, { id, version: 2, archived: false });
    expect(titles(mom)).toEqual(["Wifi helye"]);
    expect(itemHistory(mom, id).map((e) => e.action)).toEqual(["restore", "archive", "create"]);
  });
  it("validates https links and assignees", () => {
    expect(() => saveItem(mom, note({ url: "javascript:alert(1)" }))).toThrow();
    expect(() => saveItem(mom, note({ url: "http://x.hu" }))).toThrow();
    saveItem(mom, note({ url: "https://ugyfelkapu.gov.hu" }));
    expect(() => saveItem(mom, matter({ assignee: "user:ghost" }))).toThrow("felelős");
    expect(() =>
      saveItem(mom, matter({ visibility: "personal", assignee: `user:${dad.id}` })),
    ).toThrow();
    saveItem(mom, matter({ assignee: `profile:${profile}` }));
  });
  it("matter → task is explicit, idempotent and gives no points", () => {
    const id = saveItem(mom, matter({ assignee: `user:${kid.id}` }));
    const a = matterToTask(mom, id, saveTask as never);
    const b = matterToTask(dad, id, saveTask as never);
    expect(a.created).toBe(true);
    expect(b).toEqual({ taskId: a.taskId, created: false });
    expect((db()!.prepare("SELECT count(*) c FROM task_templates").get() as { c: number }).c).toBe(
      1,
    );
    expect(
      JSON.parse(
        (
          db()!.prepare("SELECT body FROM task_templates WHERE id=?").get(a.taskId) as {
            body: string;
          }
        ).body,
      ).points,
    ).toBe(0);
    saveItem(mom, { ...matter({ assignee: `user:${kid.id}`, status: "done" }), id, version: 1 });
    expect(balanceOf(`user:${kid.id}`).balance).toBe(0);
    expect(() => matterToTask(kid, id, saveTask as never)).toThrow();
  });
  it("matter → task rolls back the new task when the link step fails", () => {
    const id = saveItem(mom, matter());
    const count = () =>
      (db()!.prepare("SELECT count(*) c FROM task_templates").get() as { c: number }).c;
    db()!.exec(
      "CREATE TRIGGER fail_link BEFORE INSERT ON matter_task_links BEGIN SELECT RAISE(ABORT,'disk'); END",
    );
    expect(() => matterToTask(mom, id, saveTask as never)).toThrow("disk");
    expect(count()).toBe(0);
    db()!.exec("DROP TRIGGER fail_link");
    expect(matterToTask(mom, id, saveTask as never).created).toBe(true);
    expect(matterToTask(mom, id, saveTask as never).created).toBe(false);
    expect(count()).toBe(1);
    // A standalone saveTask still opens and commits its own transaction.
    expect(db()!.isTransaction).toBe(false);
  });
  it("RPC requires a session; child cannot write", async () => {
    await expect(notesList({ data: {} })).rejects.toThrow("Bejelentkezés");
    await expect(noteSave({ data: note() })).rejects.toThrow("Bejelentkezés");
    context.token = createSession(kid.id, "t");
    await expect(noteSave({ data: note() })).rejects.toThrow("felnőtt");
    await expect(noteArchive({ data: { id: "x", version: 1, archived: true } })).rejects.toThrow();
    await expect(matterTask({ data: { id: "x" } })).rejects.toThrow();
    context.token = createSession(mom.id, "t");
    await noteSave({ data: note() });
    expect((await notesList({ data: {} })).items).toHaveLength(1);
  });
});
