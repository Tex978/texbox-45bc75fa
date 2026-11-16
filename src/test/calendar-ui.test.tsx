import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createUser, resetAuthDb, type User } from "@/lib/auth.server";
import * as C from "@/lib/calendar.server";
import { budapestToday } from "@/lib/task-schema";
let me: User, dir: string;
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/calendar.functions", () => ({
  calendarGet: async ({ data }: { data: { from: string; to: string; person?: string } }) =>
    C.calendarRange(me, data),
  calendarSave: async ({ data }: { data: Parameters<typeof C.saveEvent>[1] }) => ({
    id: C.saveEvent(me, data),
  }),
  calendarOccurrence: async ({ data }: { data: Parameters<typeof C.changeOccurrence>[1] }) =>
    C.changeOccurrence(me, data),
  calendarToTask: async ({ data }: { data: Parameters<typeof C.eventToTask>[1] }) =>
    C.eventToTask(me, data),
}));
import { Calendar } from "@/components/Calendar";
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cal-ui-"));
  process.env["DATA_DIR"] = dir;
  resetAuthDb();
  me = createUser({ username: "anya", displayName: "Anya", role: "adult" });
});
afterEach(() => {
  cleanup();
  resetAuthDb();
  rmSync(dir, { recursive: true, force: true });
});
it("creates an event through the form, shows it in Upcoming and turns it into one task only", async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Calendar />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: /Új esemény/ }));
  fireEvent.change(screen.getByLabelText("Cím"), { target: { value: "Fogorvos" } });
  fireEvent.click(screen.getByRole("button", { name: "Mentés" }));
  fireEvent.click(await screen.findByRole("button", { name: /Fogorvos/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Feladat ebből" }));
  expect(await screen.findByText(/Feladat létrehozva 0 ponttal/)).toBeTruthy();
  const id = C.calendarRange(me, { from: budapestToday(), to: budapestToday() }).occurrences[0]!;
  expect(C.eventToTask(me, { id: id.eventId, date: id.origDate, assignee: null }).created).toBe(
    false,
  );
});
