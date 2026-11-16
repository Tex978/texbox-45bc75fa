import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createUser, createChildProfile, updateChildProfile, listChildProfiles, listUsers, familyAccountStatus, createInviteToken, acceptInvite, sessionUser, resetAuthDb, type User } from "@/lib/auth.server";

let parent: User;
let dir: string;
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/components/Shell", () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
  Card: ({ title, children }: { title?: string; children: React.ReactNode }) => <section><h2>{title}</h2>{children}</section>,
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/lib/auth.functions", () => ({
  familyList: async () => ({ meId: parent.id, owner: true, canManageAccounts: true, children: listChildProfiles(), users: listUsers().map(u => ({ ...u, ...familyAccountStatus(u.id) })) }),
  familyCreate: async ({ data }: { data: Parameters<typeof createUser>[0] }) => {
    const u = createUser(data);
    return { link: `http://nas.test/__invite?t=${createInviteToken(u.id)}` };
  },
  familyCreateChild: async ({ data }: { data: { displayName: string; icon: string } }) => ({ id: createChildProfile(parent, data.displayName, data.icon) }),
  familyUpdateChild: async ({ data }: { data: { id: string; displayName: string; icon: string; disabled: boolean } }) => updateChildProfile(parent, data.id, data.displayName, data.icon, data.disabled),
  familyDelete: vi.fn(), familyUpdate: vi.fn(), familyResetLink: vi.fn(), familyRevokeSessions: vi.fn(),
}));
import { Family } from "@/routes/family";

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "texbox-family-flow-"));
  process.env["DATA_DIR"] = dir;
  resetAuthDb();
  parent = createUser({ username: "apa", displayName: "Apa", role: "admin", password: "jelszo123" });
});
afterEach(() => { cleanup(); resetAuthDb(); rmSync(dir, { recursive: true, force: true }); });

describe("family UI with isolated real NAS SQLite storage", () => {
  it("creates, edits and reads back a child profile through the family form", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const mount = () => render(<QueryClientProvider client={qc}><Family /></QueryClientProvider>);
    const view = mount();
    fireEvent.change(await screen.findByLabelText("Gyermek neve"), { target: { value: "Bence" } });
    fireEvent.click(screen.getByRole("button", { name: "Profil létrehozása" }));
    await screen.findByLabelText("Bence új neve");
    expect(listChildProfiles()[0]?.displayName).toBe("Bence");
    fireEvent.change(screen.getByLabelText("Bence új neve"), { target: { value: "Benci" } });
    fireEvent.click(screen.getByRole("button", { name: "Mentés" }));
    await screen.findByLabelText("Benci új neve");
    view.unmount(); qc.clear(); resetAuthDb();
    mount();
    await screen.findByLabelText("Benci új neve");
    expect(listChildProfiles()[0]?.displayName).toBe("Benci");
  });
  it("invites a real adult through the UI and activates that one-time link", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><Family /></QueryClientProvider>);
    fireEvent.change(await screen.findByLabelText("Felhasználónév"), { target: { value: "anya" } });
    fireEvent.change(screen.getByLabelText("Megjelenített név"), { target: { value: "Anya" } });
    fireEvent.click(screen.getByRole("button", { name: "Meghívó link" }));
    await waitFor(() => expect(listUsers().some(u => u.username === "anya")).toBe(true));
    const link = await screen.findByText(/http:\/\/nas.test\/__invite/);
    const token = new URL(link.textContent || "").searchParams.get("t");
    if (!token) throw new Error("No invite token");
    const session = acceptInvite(token, "jelszo456");
    expect(sessionUser(session)?.username).toBe("anya");
    expect(() => acceptInvite(token, "jelszo789")).toThrow();
  });
});