import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createUser, createSession, resetAuthDb, updateOwnProfile } from "@/lib/auth.server";
import { chatSend, chatList, chatStatus, chatMarkRead, chatReact } from "@/lib/chat.server";
import { uploadChatFile, draftFiles } from "@/lib/chat-files.server";
let token: string, dir: string;
vi.mock("@/lib/chat-upload", () => ({
  uploadChatFileBrowser: async (file: File, progress: (n: number) => void) => {
    const bytes = await new Promise<Uint8Array>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
    progress(50);
    const result = await uploadChatFile(
      token,
      { name: file.name, size: file.size, mime: file.type },
      new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(bytes);
          c.close();
        },
      }),
    );
    progress(100);
    return result;
  },
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/chat.functions", () => ({
  chatDraftFiles: async () => draftFiles(token),
  chatUnread: async () => chatStatus(token),
  chatMessages: async ({ data }: { data: { before?: number } }) => chatList(token, data.before),
  chatMessageSend: async ({ data }: { data: Parameters<typeof chatSend>[1] }) =>
    chatSend(token, data),
  chatRead: async ({ data }: { data: { through: number } }) => chatMarkRead(token, data.through),
  chatReactionSave: async ({ data }: { data: Parameters<typeof chatReact>[1] }) =>
    chatReact(token, data),
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
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: () => {},
  });
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
  const field = screen.getByLabelText("Üzenet") as HTMLTextAreaElement;
  fireEvent.change(field, { target: { value: "Én is indulok." } });
  field.setSelectionRange(5, 5);
  fireEvent.select(field);
  fireEvent.click(screen.getByRole("button", { name: "Emojiválasztó" }));
  fireEvent.click(screen.getByRole("button", { name: "Beszúrás: Vidám cica" }));
  expect(field.value).toBe("Én is😺 indulok.");
  fireEvent.click(screen.getByRole("button", { name: "Üzenet küldése" }));
  await screen.findByText("Én is😺 indulok.");
  expect(chatList(dadToken).items.at(-1)).toMatchObject({ text: "Én is😺 indulok.", name: "Anya" });
  const messageId = chatList(dadToken).items[0]?.id;
  fireEvent.click(screen.getByRole("button", { name: `Reakció hozzáadása: ${messageId}. üzenet` }));
  fireEvent.click(screen.getByRole("button", { name: "Láttam / oké reakció" }));
  await screen.findByRole("button", { name: "Láttam / oké reakció, 1" });
  expect(chatList(dadToken).items[0]?.reactions[0]?.people[0]?.name).toBe("Anya");
  fireEvent.click(screen.getByRole("button", { name: "Láttam / oké reakció, 1" }));
  await waitFor(() => expect(chatList(dadToken).items[0]?.reactions).toEqual([]));
  const image = new File(
    [
      new Uint8Array(
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4GQAAAAASUVORK5CYII=",
          "base64",
        ),
      ),
    ],
    "family.png",
    { type: "image/png" },
  );
  fireEvent.change(screen.getByLabelText("Chat csatolmányok"), { target: { files: [image] } });
  await screen.findByText("family.png");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Üzenet küldése" })).not.toBeDisabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Üzenet küldése" }));
  await waitFor(() => expect(chatList(dadToken).items).toHaveLength(3));
  expect(chatList(dadToken).items.at(-1)?.attachments[0]?.name).toBe("family.png");
  resetAuthDb();
  expect(chatList(dadToken).items).toHaveLength(3);
  qc.clear();
  vi.restoreAllMocks();
});
