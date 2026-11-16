import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createUser, createSession, resetAuthDb, updateOwnProfile } from "@/lib/auth.server";
import { chatSend, chatList, chatStatus, chatMarkRead } from "@/lib/chat.server";
let token: string, dir: string;
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/chat.functions", () => ({
  chatUnread: async () => chatStatus(token),
  chatMessages: async ({ data }: { data: { before?: number } }) => chatList(token, data.before),
  chatMessageSend: async ({ data }: { data: Parameters<typeof chatSend>[1] }) =>
    chatSend(token, data),
  chatRead: async ({ data }: { data: { through: number } }) => chatMarkRead(token, data.through),
}));
import { FamilyChat } from "@/components/FamilyChat";
afterEach(() => {
  cleanup();
  resetAuthDb();
  delete process.env["DATA_DIR"];
  if (dir) rmSync(dir, { recursive: true, force: true });
});
it("sends and reads back SQLite messages through the authenticated chat UI", async () => {
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  dir = mkdtempSync(join(tmpdir(), "texbox-chat-ui-"));
  process.env["DATA_DIR"] = dir;
  resetAuthDb();
  const dad = createUser({ username: "apa", displayName: "Apa", role: "admin" }),
    mom = createUser({ username: "anya", displayName: "Anya", role: "adult" });
  updateOwnProfile(dad, { displayName: "Apa", icon: "cat", color: "c2", version: 0 });
  token = createSession(mom.id, "test");
  const dadToken = createSession(dad.id, "test");
  chatSend(dadToken, { text: "Hazaértem!", clientRequestId: randomUUID() });
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <FamilyChat userId={mom.id} />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Családi chat, 1 olvasatlan" }));
  await screen.findByText("Hazaértem!");
  await waitFor(() => expect(chatStatus(token).unread).toBe(0));
  fireEvent.change(screen.getByLabelText("Üzenet"), { target: { value: "Én is indulok." } });
  fireEvent.click(screen.getByRole("button", { name: "Üzenet küldése" }));
  await screen.findByText("Én is indulok.");
  expect(chatList(dadToken).items.at(-1)).toMatchObject({ text: "Én is indulok.", name: "Anya" });
  resetAuthDb();
  expect(chatList(dadToken).items).toHaveLength(2);
  qc.clear();
  vi.restoreAllMocks();
});
