import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createUser, createChildProfile, resetAuthDb, type User } from "@/lib/auth.server";
import { listTasks, saveTask, archiveTask, actOnTask } from "@/lib/tasks.server";
let parent: User, dir: string, profile: string;
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/tasks.functions", () => ({
  tasksList: async () => listTasks(parent),
  tasksSave: async ({ data }: { data: Parameters<typeof saveTask>[1] }) => ({
    id: saveTask(parent, data),
  }),
  tasksArchive: async ({ data }: { data: { id: string; version: number } }) =>
    archiveTask(parent, data.id, data.version),
  tasksAct: async ({ data }: { data: Parameters<typeof actOnTask>[1] }) => actOnTask(parent, data),
}));
import { Tasks } from "@/components/Tasks";
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "task-ui-"));
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
it("saves recurring child task through UI, reads it after restart and approves completion", async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const mount = () =>
    render(
      <QueryClientProvider client={qc}>
        <Tasks />
      </QueryClientProvider>,
    );
  const view = mount();
  fireEvent.click(await screen.findByRole("button", { name: "Új feladat" }));
  fireEvent.change(screen.getByLabelText("Cím"), { target: { value: "Játékok elpakolása" } });
  fireEvent.change(screen.getByLabelText("Felelős"), { target: { value: `profile:${profile}` } });
  fireEvent.change(screen.getByLabelText("Ismétlődés"), { target: { value: "daily" } });
  fireEvent.change(screen.getByLabelText("Pontérték"), { target: { value: "15" } });
  fireEvent.click(screen.getByRole("button", { name: "Mentés" }));
  await screen.findByRole("status");
  expect(listTasks(parent).templates[0]?.recurrence).toBe("daily");
  view.unmount();
  qc.clear();
  resetAuthDb();
  mount();
  fireEvent.change(await screen.findByLabelText("Feladatok"), {
    target: { value: `profile:${profile}` },
  });
  fireEvent.click(await screen.findByRole("button", { name: "Elkészült a nevében" }));
  fireEvent.click(await screen.findByRole("button", { name: "Jóváhagyom" }));
  await screen.findByText("Teljesítés jóváhagyva.");
  expect(
    listTasks(parent).occurrences.find((o) => o.date === listTasks(parent).today)?.status,
  ).toBe("approved");
  expect(listTasks(parent).templates[0]?.points).toBe(15);
});
