import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fireEvent, render, screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createUser, resetAuthDb, type User } from "@/lib/auth.server";
import * as S from "@/lib/organizer.server";
let me: User, dir: string;
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/organizer.functions", () => ({
  shopList: async () => S.shoppingOverview(me),
  shopSaveItem: async ({ data }: { data: Parameters<typeof S.saveItem>[1] }) => ({
    id: S.saveItem(me, data),
  }),
  shopCheck: async ({ data }: { data: { id: string; checked: boolean } }) => S.checkItem(me, data),
  shopDelete: async ({ data }: { data: { ids: string[] } }) => S.deleteItems(me, data),
  shopSaveList: async ({ data }: { data: { name: string } }) => ({ id: S.saveList(me, data) }),
  recipesList: async () => S.listRecipes(me),
  recipeSave: vi.fn(),
  recipeToList: vi.fn(),
  menuGet: async () => S.menuWeek(me),
  menuAdd: vi.fn(),
  menuRemove: vi.fn(),
  menuCopy: vi.fn(),
}));
vi.mock("@/lib/notes.functions", () => ({
  notesList: vi.fn(),
  noteSave: vi.fn(),
  noteArchive: vi.fn(),
  noteHistory: vi.fn(),
  matterTask: vi.fn(),
}));
vi.mock("@/lib/calendar.functions", () => ({
  calendarGet: vi.fn(),
  calendarSave: vi.fn(),
  calendarOccurrence: vi.fn(),
  calendarToTask: vi.fn(),
}));
import { Organizer } from "@/components/Organizer";
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "org-ui-"));
  process.env["DATA_DIR"] = dir;
  resetAuthDb();
  me = createUser({ username: "anya", displayName: "Anya", role: "adult" });
});
afterEach(() => {
  cleanup();
  resetAuthDb();
  rmSync(dir, { recursive: true, force: true });
});
it("adds an item in one step and ticks it with one tap, persisted in SQLite", async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Organizer />
    </QueryClientProvider>,
  );
  fireEvent.change(await screen.findByLabelText("Új termék"), { target: { value: "Kenyér" } });
  fireEvent.click(screen.getByRole("button", { name: "Hozzáadás" }));
  fireEvent.click(await screen.findByRole("button", { name: "Kenyér kipipálása" }));
  await screen.findByRole("button", { name: "Kenyér visszavonása" });
  resetAuthDb();
  await waitFor(() =>
    expect(S.shoppingOverview(me).items[0]).toMatchObject({
      name: "Kenyér",
      checked: true,
      checkedBy: "Anya",
    }),
  );
});
