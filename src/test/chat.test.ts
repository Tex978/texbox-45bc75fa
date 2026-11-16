import { afterEach, beforeEach, expect, it } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  createUser,
  createSession,
  endSession,
  updateUser,
  resetAuthDb,
  db,
} from "@/lib/auth.server";
import { chatSend, chatList, chatStatus, chatMarkRead } from "@/lib/chat.server";
let dir: string, dad: string, mom: string, kid: string, momId: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "texbox-chat-"));
  process.env["DATA_DIR"] = dir;
  resetAuthDb();
  dad = createSession(
    createUser({ username: "apa", displayName: "Apa", role: "admin" }).id,
    "test",
  );
  const u = createUser({ username: "anya", displayName: "Anya", role: "adult" });
  momId = u.id;
  mom = createSession(u.id, "test");
  kid = createSession(
    createUser({ username: "gyerek", displayName: "Gyerek", role: "child" }).id,
    "test",
  );
});
afterEach(() => {
  resetAuthDb();
  delete process.env["DATA_DIR"];
  rmSync(dir, { recursive: true, force: true });
});
const input = (text = "Szia család!") => ({ text, clientRequestId: randomUUID() });
it("backs up before additive schema and preserves text/session on restart", () => {
  expect(existsSync(join(dir, "backups/pre-chat-phase9b.db"))).toBe(true);
  const id = chatSend(dad, input()).id;
  resetAuthDb();
  expect(chatList(mom).items[0]).toMatchObject({
    id,
    text: "Szia család!",
    name: "Apa",
    mine: false,
  });
});
it("deduplicates retries per sender and rejects conflicting payloads", () => {
  const v = input();
  const id = chatSend(dad, v).id;
  expect(chatSend(dad, v).id).toBe(id);
  expect(() => chatSend(dad, { ...v, text: "Más" })).toThrow();
  expect(chatSend(mom, v).id).not.toBe(id);
  expect(chatList(dad).items).toHaveLength(2);
});
it("unread is personal, excludes own messages, receipts never move backwards", () => {
  const a = chatSend(dad, input()).id;
  const b = chatSend(dad, input("Második")).id;
  expect(chatStatus(dad).unread).toBe(0);
  expect(chatStatus(mom).unread).toBe(2);
  chatMarkRead(mom, b);
  chatMarkRead(mom, a);
  expect(chatStatus(mom).unread).toBe(0);
  expect(chatStatus(kid).unread).toBe(2);
  expect(() => chatMarkRead(mom, 9999)).toThrow();
});
it("rejects anonymous, invented and revoked sessions on all paths", () => {
  for (const t of [undefined, "not-a-session"]) {
    expect(() => chatList(t)).toThrow();
    expect(() => chatSend(t, input())).toThrow();
    expect(() => chatMarkRead(t, 1)).toThrow();
    expect(() => chatStatus(t)).toThrow();
  }
  endSession(mom);
  expect(() => chatList(mom)).toThrow();
  expect(() => chatSend(mom, input())).toThrow();
});
it("disabled accounts lose access immediately; child is read-only", () => {
  updateUser(momId, { disabled: true });
  expect(() => chatList(mom)).toThrow();
  expect(() => chatSend(mom, input())).toThrow();
  expect(chatStatus(kid).canSend).toBe(false);
  expect(() => chatSend(kid, input())).toThrow();
});
it("validates blank/oversize text and forged sender id", () => {
  expect(() => chatSend(dad, input(" "))).toThrow();
  expect(() => chatSend(dad, input("x".repeat(1001)))).toThrow();
  expect(() =>
    chatSend(dad, { ...input(), senderId: momId } as ReturnType<typeof input>),
  ).toThrow();
  expect(chatSend(dad, input("x".repeat(1000))).id).toBeGreaterThan(0);
});
it("pages 100 messages without dropping older messages", () => {
  for (let i = 0; i < 105; i++) chatSend(dad, input(`Üzenet ${i}`));
  const first = chatList(mom);
  expect(first.items).toHaveLength(100);
  expect(first.olderCursor).not.toBeNull();
  const older = chatList(mom, first.olderCursor ?? undefined);
  expect(older.items).toHaveLength(5);
  expect(older.olderCursor).toBeNull();
  expect(() => chatList(mom, -1)).toThrow();
  expect((db()?.prepare("SELECT COUNT(*) n FROM chat_messages").get() as { n: number }).n).toBe(
    105,
  );
});
