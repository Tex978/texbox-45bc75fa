import { beforeEach, afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  createUser,
  createSession,
  endSession,
  updateUser,
  resetAuthDb,
  db,
} from "@/lib/auth.server";
import { chatSend, chatReact, chatList, chatStatus } from "@/lib/chat.server";
import { CAT_EMOJIS, insertChatEmoji, type ChatReaction } from "@/lib/chat-schema";
let dir: string, dad: string, mom: string, kid: string, momId: string, messageId: number;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "texbox-cat-"));
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
  messageId = chatSend(dad, { text: "👨‍👩‍👧‍👦 ❤️ 😺", clientRequestId: randomUUID() }).id;
});
afterEach(() => {
  resetAuthDb();
  delete process.env["DATA_DIR"];
  rmSync(dir, { recursive: true, force: true });
});
const v = (emoji: ChatReaction["emoji"], version = 0) => ({ messageId, emoji, version });
it("supports all seven concrete cat emoji values", () => {
  expect(CAT_EMOJIS).toEqual(["😺", "😸", "😻", "🙀", "😿", "😾", "🐾"]);
  CAT_EMOJIS.forEach((e, i) => {
    chatReact(mom, v(e, i));
    expect(chatList(dad).items[0].myReaction).toBeNull();
    expect(chatList(mom).items[0].myReaction).toBe(e);
  });
});
it("aggregates people, preserves reactions and UTF-8 text across restart", () => {
  chatReact(mom, v("🐾"));
  chatReact(dad, v("🐾"));
  resetAuthDb();
  const m = chatList(mom).items[0];
  expect(m.text).toBe("👨‍👩‍👧‍👦 ❤️ 😺");
  expect(m.reactions[0].people.map((p) => p.name).sort()).toEqual(["Anya", "Apa"]);
  expect(m.reactionVersion).toBe(1);
  expect(chatStatus(mom).unread).toBe(1);
});
it("idempotent retry does not duplicate or flip off; switch/remove only one's own vote", () => {
  chatReact(mom, v("😺"));
  expect(chatReact(mom, v("😺")).version).toBe(1);
  chatReact(dad, v("😺"));
  chatReact(mom, v("😻", 1));
  chatReact(mom, v(null, 2));
  expect(chatReact(mom, v(null, 2)).version).toBe(3);
  expect(chatList(mom).items[0].reactions[0].people).toHaveLength(1);
  expect(chatList(dad).items[0].myReaction).toBe("😺");
});
it("two devices conflict rather than silently overwriting a newer reaction", () => {
  const other = createSession(momId, "mobile2");
  chatReact(mom, v("😺"));
  expect(() => chatReact(other, v("😸"))).toThrow(/másik eszköz/);
  chatReact(other, v("😸", 1));
  expect(() => chatReact(mom, v(null, 1))).toThrow();
  expect(chatList(mom).items[0].myReaction).toBe("😸");
});
it("unique actor vote enforced across separate SQLite connections", () => {
  chatReact(mom, v("🐾"));
  const d2 = new DatabaseSync(join(dir, "texbox.db"));
  try {
    expect(() =>
      d2
        .prepare(
          "INSERT INTO chat_reactions(message_id,user_id,emoji,version,updated_at) VALUES(?,?,?,?,?)",
        )
        .run(messageId, momId, "😺", 1, Date.now()),
    ).toThrow();
    expect(
      (
        d2.prepare("SELECT COUNT(*) n FROM chat_reactions WHERE user_id=?").get(momId) as {
          n: number;
        }
      ).n,
    ).toBe(1);
  } finally {
    d2.close();
  }
});
it("rejects forged identities, unknown emoji, deleted messages and unauthorized sessions", () => {
  expect(() => chatReact(mom, { ...v("😺"), userId: "fake" } as ChatReaction)).toThrow();
  expect(() => chatReact(mom, { ...v("😺"), emoji: "<svg>" } as ChatReaction)).toThrow();
  for (const t of [undefined, "fake", kid]) expect(() => chatReact(t, v("😺"))).toThrow();
  chatReact(mom, v("😺"));
  db()?.prepare("DELETE FROM chat_messages WHERE id=?").run(messageId);
  expect(() => chatReact(mom, v("🐾", 1))).toThrow(/nem található/);
  expect((db()?.prepare("SELECT COUNT(*) n FROM chat_reactions").get() as { n: number }).n).toBe(0);
});
it("revoked or disabled users cannot mutate; disabled votes disappear from counts", () => {
  chatReact(mom, v("🐾"));
  endSession(mom);
  expect(() => chatReact(mom, v("😺", 1))).toThrow();
  const t = createSession(momId, "other");
  updateUser(momId, { disabled: true });
  expect(() => chatReact(t, v(null, 1))).toThrow();
  expect(chatList(dad).items[0].reactions).toEqual([]);
});
it("takes snapshot before additive migration without losing prior messages", () => {
  resetAuthDb();
  const d = new DatabaseSync(join(dir, "texbox.db"));
  d.exec("DROP TABLE chat_reactions");
  d.close();
  rmSync(join(dir, "backups/pre-chat-reactions.db"));
  resetAuthDb();
  expect(chatList(mom).items[0].id).toBe(messageId);
  expect(existsSync(join(dir, "backups/pre-chat-reactions.db"))).toBe(true);
  const backup = new DatabaseSync(join(dir, "backups/pre-chat-reactions.db"), { readOnly: true });
  try {
    expect(
      (
        backup.prepare("SELECT text FROM chat_messages WHERE id=?").get(messageId) as {
          text: string;
        }
      ).text,
    ).toBe("👨‍👩‍👧‍👦 ❤️ 😺");
    expect(
      backup.prepare("SELECT 1 FROM sqlite_master WHERE name='chat_reactions'").get(),
    ).toBeUndefined();
  } finally {
    backup.close();
  }
});
it("inserts at cursor or replaces selection without splitting multi-codepoint emojis", () => {
  expect(insertChatEmoji("Szia világ", 5, 5, "😺")).toEqual({ text: "Szia 😺világ", cursor: 7 });
  expect(insertChatEmoji("A👨‍👩‍👧‍👦B", 3, 4, "🐾")).toEqual({ text: "A🐾B", cursor: 3 });
  expect(insertChatEmoji("A❤️B", 1, 3, "😻").text).toBe("A😻B");
});
