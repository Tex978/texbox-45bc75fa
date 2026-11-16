import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createUser, resetAuthDb, type User } from "@/lib/auth.server";
let me: User;
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({
  Link: (p: { children: unknown }) => <a>{p.children as never}</a>,
}));
vi.mock("@/lib/notes.functions", async () => {
  const s = await import("@/lib/notes.server");
  return {
    notesList: async ({ data }: { data: { archived?: boolean } }) => s.listItems(me, data),
    noteSave: async ({ data }: { data: never }) => ({ id: s.saveItem(me, data) }),
    noteArchive: async ({ data }: { data: never }) => s.setArchived(me, data),
    noteHistory: async ({ data }: { data: { id: string } }) => s.itemHistory(me, data.id),
    matterTask: vi.fn(),
  };
});
import { Notes } from "@/components/Notes";
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "notes-ui-"));
  process.env["DATA_DIR"] = dir;
  resetAuthDb();
  me = createUser({ username: "anya", displayName: "Anya", role: "adult" });
});
afterEach(() => {
  cleanup();
  resetAuthDb();
  rmSync(dir, { recursive: true, force: true });
});
describe("notes UI", () => {
  it("creates, shows and archives a note saved in SQLite", async () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Notes />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Új jegyzet/ }));
    fireEvent.change(screen.getByLabelText("Cím"), { target: { value: "Óvodai kód" } });
    fireEvent.click(screen.getByRole("button", { name: "Mentés" }));
    expect(await screen.findByText("Óvodai kód")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Archiválás/ }));
    expect(await screen.findByText("Archiválva.")).toBeTruthy();
    expect(await screen.findByText("Még nincs jegyzet.")).toBeTruthy();
  });
});
