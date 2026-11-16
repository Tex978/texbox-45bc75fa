import { beforeEach, afterEach, it, expect, vi, describe } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { render, screen, cleanup, within, fireEvent, waitFor } from "@testing-library/react";
import { getDashboard } from "@/lib/dashboard.server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createUser, createChildProfile, resetAuthDb, type User } from "@/lib/auth.server";
import { saveTask, listTasks, actOnTask } from "@/lib/tasks.server";
import { adjustPoints, pointsOverview } from "@/lib/points.server";
import { saveEvent, calendarRange } from "@/lib/calendar.server";
import { shoppingOverview, saveItem, menuWeek } from "@/lib/organizer.server";
import { budapestToday } from "@/lib/task-schema";
let me: User | null, dir: string;
const run = vi.hoisted(() => vi.fn());
const need = () => {
  if (!me) throw new Error("A feladatokhoz jelentkezz be a saját NAS-címeden.");
  return me;
};
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({
  Link: (p: { children: unknown }) => <a>{p.children as never}</a>,
}));
vi.mock("@/components/Shell", () => ({
  meQuery: { queryKey: ["me"], queryFn: async () => ({ user: me }) },
}));
vi.mock("@/lib/tasks.functions", () => ({ tasksList: async () => listTasks(need()) }));
vi.mock("@/lib/points.functions", () => ({ pointsList: async () => pointsOverview(need()) }));
vi.mock("@/lib/calendar.functions", () => ({
  calendarGet: async ({ data }: { data: { from: string; to: string } }) =>
    calendarRange(need(), data),
}));
vi.mock("@/lib/organizer.functions", () => ({
  shopList: async () => shoppingOverview(need()),
  menuGet: async () => menuWeek(need()),
}));
vi.mock("@/lib/scenes.functions", () => ({
  scenesList: async () => ({ scenes: [] }),
  scenesRun: run,
  scenesRuns: vi.fn(),
}));
vi.mock("@/lib/nas.functions", () => ({
  getThermometers: async () => ({ demo: true, error: "", meta: {}, sensors: [] }),
  getSolar: async () => ({ demo: true, error: "", currentW: 3420 }),
  getOverview: async () => ({ demo: true, volumes: [], streams: [], recent: [], watched: [] }),
}));
vi.mock("@/lib/use-shared-pref", () => ({
  sharedPrefsQuery: {
    queryKey: ["shared-prefs"],
    queryFn: async () => ({ prefs: { "home-favorites": ["gree"] } }),
  },
}));
vi.mock("@/lib/dashboard.functions", async () => {
  const srv = await import("@/lib/dashboard.server");
  return {
    dashboardGet: async () => srv.getDashboard(need()),
    dashboardSave: async ({ data }: { data: Parameters<typeof srv.saveDashboard>[1] }) =>
      srv.saveDashboard(need(), data),
  };
});
vi.mock("@/lib/notifications.functions", () => ({
  notificationsUnread: async () => ({ unread: 0 }),
}));
import { Dashboard } from "@/components/Dashboard";
const view = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Dashboard />
    </QueryClientProvider>,
  );
let parent: User, kid: User;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "dash-ui-"));
  process.env["DATA_DIR"] = dir;
  resetAuthDb();
  parent = createUser({ username: "anya", displayName: "Anya Kovács", role: "adult" });
  kid = createUser({ username: "bence", displayName: "Bence", role: "child" });
  createChildProfile(parent, "Kicsi");
  const today = budapestToday();
  const t = saveTask(parent, {
    title: "Szobarend",
    description: "",
    category: "",
    points: 5,
    visibility: "personal",
    assignee: `user:${kid.id}`,
    start: today,
    end: null,
    time: "18:00",
    priority: "normal",
    reminder: false,
    recurrence: "once",
    weekdays: [],
    dates: [],
  });
  const o = listTasks(parent).occurrences.find((x) => x.templateId === t)!;
  actOnTask(kid, { id: o.id, version: o.version, action: "complete" });
  adjustPoints(parent, {
    person: `user:${kid.id}`,
    delta: 42,
    reason: "Kezdő pont",
    requestId: "r1",
  });
  saveEvent(parent, {
    title: "Úszás",
    date: today,
    start: "17:00",
    end: "18:00",
    people: [`user:${kid.id}`],
  });
  saveEvent(parent, { title: "Anya fogorvos", date: today, visibility: "private" });
  saveItem(parent, { listId: shoppingOverview(parent).lists[0]!.id, name: "Tej" });
});
afterEach(() => {
  cleanup();
  resetAuthDb();
  rmSync(dir, { recursive: true, force: true });
});
describe("6a dashboard", () => {
  it("parent sees real approvals, events, shopping and favourites", async () => {
    me = parent;
    view();
    expect(await screen.findByText("1 gyermekfeladat vár jóváhagyásra")).toBeTruthy();
    const next = calendarRange(parent, { from: budapestToday(), to: budapestToday() })
      .occurrences[0];
    if (!next) throw new Error("Expected a saved event");
    expect(await screen.findByText(next.title)).toBeTruthy();
    expect(await screen.findByText("1 tétel vár")).toBeTruthy();
    expect(await screen.findByText("Klímák")).toBeTruthy();
    expect(await screen.findByText(/Bemutató adat/)).toBeTruthy();
    expect(screen.getByText(/Még nincs mentett jelenet/)).toBeTruthy();
    expect(run).not.toHaveBeenCalled();
  });
  it("child sees own real points and tasks, never others' private events or parent alerts", async () => {
    me = kid;
    const { container } = view();
    expect(await screen.findByText("42 pont")).toBeTruthy();
    expect(await screen.findByText("Úszás")).toBeTruthy();
    const today = await screen.findByLabelText("Mai feladatok");
    expect(await within(today).findByText(/szülői jóváhagyásra vár/)).toBeTruthy();
    expect(screen.queryByText(/vár jóváhagyásra$/)).toBeNull();
    expect(screen.queryByText("Anya fogorvos")).toBeNull();
    expect(container.querySelector(".dash-child")).toBeTruthy();
  });
  it("shows clear error states when signed out / preview instead of fake data", async () => {
    me = null;
    view();
    expect(
      (await screen.findAllByText(/jelentkezz be a saját NAS-címeden/)).length,
    ).toBeGreaterThan(3);
    expect(screen.queryByText(/pont$/)).toBeNull();
  });
  it("6b: edits, hides and saves a personal layout on the server", async () => {
    me = parent;
    view();
    fireEvent.click(await screen.findByRole("button", { name: /Főoldal szerkesztése/ }));
    fireEvent.click(screen.getByRole("button", { name: "Bevásárlás elrejtése" }));
    fireEvent.click(screen.getByRole("button", { name: "Mai feladatok feljebb" }));
    fireEvent.click(screen.getByRole("button", { name: "Mentés" }));
    expect(await screen.findByText("Főoldal mentve a NAS-on.")).toBeTruthy();
    await waitFor(() => expect(screen.queryByLabelText("Bevásárlás")).toBeNull());
    const saved = getDashboard(parent);
    expect(saved.prefs.order[0]).toBe("tasks");
    expect(saved.prefs.hidden).toEqual(["shopping"]);
    expect(getDashboard(kid).saved).toBe(false);
  });
});
