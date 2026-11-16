import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUser, createSession, resetAuthDb } from "@/lib/auth.server";
const context = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    v: (x: unknown) => x,
    inputValidator(v: (x: unknown) => unknown) {
      this.v = v;
      return this;
    },
    handler(fn: (a: { data: unknown }) => unknown) {
      const v = this.v;
      return async (a?: { data: unknown }) => fn({ data: v(a?.data) });
    },
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getCookie: () => context.token }));
import * as F from "@/lib/organizer.functions";
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "org-rpc-"));
  process.env["DATA_DIR"] = dir;
  resetAuthDb();
  context.token = undefined;
});
afterEach(() => {
  resetAuthDb();
  rmSync(dir, { recursive: true, force: true });
});
it("rejects signed-out reads/writes, malformed input and child privileged writes", async () => {
  createUser({ username: "anya", displayName: "Anya", role: "adult" });
  const kid = createUser({ username: "kid", displayName: "Kid", role: "child" });
  await expect(F.shopList()).rejects.toThrow("Bejelentkezés");
  await expect(F.recipesList()).rejects.toThrow("Bejelentkezés");
  await expect(F.menuGet({ data: {} })).rejects.toThrow("Bejelentkezés");
  context.token = createSession(kid.id, "t");
  const list = (await F.shopList()).lists[0]!.id;
  await expect(
    F.shopSaveItem({ data: { listId: list, name: "<script>", qty: "sok" } }),
  ).rejects.toThrow();
  await expect(F.recipeSave({ data: { title: "x", servings: 1 } })).rejects.toThrow("szülő");
  await expect(
    F.menuAdd({ data: { day: "2026-11-16", meal: "ebed", title: "x" } }),
  ).rejects.toThrow("felnőtt");
  await expect(F.shopSaveList({ data: { name: "x" } })).rejects.toThrow("felnőtt");
  await expect(F.menuGet({ data: { date: "nem-datum" } })).rejects.toThrow();
  // Text is stored verbatim and rendered by React as text, never HTML.
  await F.shopSaveItem({ data: { listId: list, name: "<b>Tej</b>" } });
  expect((await F.shopList()).items[0]?.name).toBe("<b>Tej</b>");
});
