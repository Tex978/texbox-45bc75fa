import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createUser,
  createSession,
  resetAuthDb,
  getUser,
  updateOwnProfile,
  changeOwnPassword,
  listOwnSessions,
  revokeOwnSession,
  sessionUser,
  listAudit,
  type User,
} from "@/lib/auth.server";

let user: User, token: string, dir: string;
vi.mock("@/components/NotificationBell", () => ({ NotificationBell: () => null }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/auth.functions", () => ({
  profileGet: async () => ({
    ...getUser(user.id),
    owner: true,
    version: getUser(user.id)?.profileVersion,
  }),
  profileUpdate: async ({ data }: { data: Parameters<typeof updateOwnProfile>[1] }) =>
    updateOwnProfile(user, data),
  passwordChange: async ({ data }: { data: Parameters<typeof changeOwnPassword>[1] }) =>
    changeOwnPassword(user, data, token),
  sessionsList: async () => listOwnSessions(user.id, token),
  sessionRevoke: async ({ data }: { data: { id: string } }) =>
    revokeOwnSession(user, data.id, token),
  sessionsRevokeOthers: vi.fn(),
  auditList: async () => listAudit(user, "me"),
  getMe: vi.fn(),
}));
import { ProfilePage } from "@/components/Profile";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetAuthDb();
  if (dir) rmSync(dir, { recursive: true, force: true });
});
it("saves own profile, changes password and revokes another device through the real SQLite-backed UI", async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  dir = mkdtempSync(join(tmpdir(), "texbox-profile-ui-"));
  process.env["DATA_DIR"] = dir;
  resetAuthDb();
  user = createUser({ username: "apa", displayName: "Apa", role: "admin", password: "jelszo123" });
  token = createSession(user.id, "Chrome Android Mobile");
  const other = createSession(user.id, "Firefox Windows");
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <ProfilePage />
    </QueryClientProvider>,
  );
  fireEvent.change(await screen.findByLabelText("Megjelenített név"), {
    target: { value: "Teszt szülő" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Cica" }));
  fireEvent.click(screen.getByRole("button", { name: "Zöld" }));
  fireEvent.click(screen.getByRole("button", { name: "Profil mentése" }));
  await screen.findByText("Profil mentve. Minden eszközön a következő frissítéskor megjelenik.");
  expect(getUser(user.id)?.displayName).toBe("Teszt szülő");
  expect(getUser(user.id)?.avatar).toEqual({ icon: "cat", color: "c2" });
  fireEvent.change(screen.getByLabelText("Jelenlegi jelszó"), { target: { value: "jelszo123" } });
  for (const label of ["Új jelszó", "Új jelszó újra"])
    fireEvent.change(screen.getByLabelText(label), { target: { value: "Kek-Hegy-2026" } });
  fireEvent.click(screen.getByRole("switch"));
  fireEvent.click(screen.getByRole("button", { name: "Jelszó módosítása" }));
  await screen.findByText("Jelszó módosítva.");
  expect(sessionUser(other)?.id).toBe(user.id);
  fireEvent.click(screen.getByRole("button", { name: /^Kijelentkeztetés$/ }));
  await screen.findByText("Eszköz kijelentkeztetve.");
  expect(sessionUser(other)).toBeNull();
  expect(sessionUser(token)?.id).toBe(user.id);
  resetAuthDb();
  expect(getUser(user.id)?.displayName).toBe("Teszt szülő");
  expect(getUser(user.id)?.avatar).toEqual({ icon: "cat", color: "c2" });
  qc.clear();
});
