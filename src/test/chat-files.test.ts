import { beforeEach, afterEach, it, expect } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  createUser,
  createSession,
  endSession,
  updateUser,
  db,
  resetAuthDb,
} from "@/lib/auth.server";
import {
  uploadChatFile,
  downloadChatFile,
  deleteChatFile,
  filePath,
  filesDir,
  draftFiles,
  parseRange,
  sameOrigin,
} from "@/lib/chat-files.server";
import { chatSend, chatList } from "@/lib/chat.server";
import { checkFileInfo, CHAT_FILE_LIMITS, MB, fileIdsSchema } from "@/lib/chat-files";
let dir: string, dad: string, mom: string, momId: string, kid: string;
const png = () =>
  new Uint8Array(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4GQAAAAASUVORK5CYII=",
      "base64",
    ),
  );
const stream = (bytes: Uint8Array) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(bytes);
      c.close();
    },
  });
const upload = (token = dad, name = "photo.png", data = png(), mime = "image/png") =>
  uploadChatFile(token, { name, size: data.length, mime }, stream(data));
const req = (range?: string) =>
  new Request("http://localhost/api/chat/file/x", { headers: range ? { range } : {} });
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "texbox-files-"));
  process.env["DATA_DIR"] = dir;
  resetAuthDb();
  dad = createSession(
    createUser({ username: "apa", displayName: "Apa", role: "admin" }).id,
    "test",
  );
  const m = createUser({ username: "anya", displayName: "Anya", role: "adult" });
  momId = m.id;
  mom = createSession(m.id, "test");
  kid = createSession(
    createUser({ username: "gyerek", displayName: "Gyerek", role: "child" }).id,
    "test",
  );
});
afterEach(() => {
  resetAuthDb();
  delete process.env["DATA_DIR"];
  delete process.env["TEXBOX_CHAT_QUOTA_MB"];
  rmSync(dir, { recursive: true, force: true });
});
it("stores image on NAS path and message metadata atomically, survives restart", async () => {
  const f = await upload();
  expect(filesDir()).toBe(join(dir, "chat-attachments"));
  expect(readFileSync(filePath(f.id))).toEqual(Buffer.from(png()));
  expect(existsSync(join(dir, "backups/pre-chat-attachments.db"))).toBe(true);
  const requestId = randomUUID();
  const data = { text: "", clientRequestId: requestId, attachmentIds: [f.id] };
  const id = chatSend(dad, data).id;
  expect(chatSend(dad, data).id).toBe(id);
  resetAuthDb();
  const m = chatList(mom).items[0];
  expect(m?.text).toBe("");
  expect(m?.attachments[0]?.id).toBe(f.id);
  const r = downloadChatFile(mom, f.id, req());
  expect(r.status).toBe(200);
  expect(r.headers.get("x-content-type-options")).toBe("nosniff");
  expect(new Uint8Array(await r.arrayBuffer())).toEqual(png());
});
it("supports real signature PDF, MP4 and WebM uploads and HTTP Range", async () => {
  const pdf = new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF");
  const p = await upload(dad, "manual.pdf", pdf, "application/pdf");
  const mp4 = new Uint8Array([
    0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0, 105, 115, 111, 109, 109, 112,
    52, 50,
  ]);
  const v = await upload(dad, "clip.mp4", mp4, "video/mp4");
  chatSend(dad, { text: "Fájlok", clientRequestId: randomUUID(), attachmentIds: [p.id, v.id] });
  const r = downloadChatFile(mom, v.id, req("bytes=4-11"));
  expect(r.status).toBe(206);
  expect(r.headers.get("content-range")).toBe(`bytes 4-11/${mp4.length}`);
  expect(new Uint8Array(await r.arrayBuffer())).toEqual(mp4.slice(4, 12));
  expect(downloadChatFile(mom, p.id, req()).headers.get("content-disposition")).toContain(
    "attachment;",
  );
  expect(downloadChatFile(mom, v.id, req("bytes=999-1000")).status).toBe(416);
});
it("rejects spoofed MIME/signature and active/unsafe file names, rolls back disk and DB", async () => {
  await expect(
    upload(dad, "evil.png", new TextEncoder().encode("<html><script>bad</script>")),
  ).rejects.toThrow(/tartalma/);
  expect(draftFiles(dad)).toEqual([]);
  await expect(
    upload(dad, "readme.txt", new TextEncoder().encode("<svg onload='bad'/>"), "text/plain"),
  ).rejects.toThrow(/Aktív/);
  for (const name of [
    "../a.png",
    "a/evil.png",
    "evil\\a.png",
    "a.exe",
    "a.apk",
    "a.sh",
    "a.bat",
    "a.html",
    "a.svg",
    "a.js",
  ])
    expect(() => checkFileInfo({ name, size: 1, mime: "" })).toThrow();
  await expect(upload(dad, "a.png", png(), "video/mp4")).rejects.toThrow();
});
it("foreign draft attachment and forged/anonymous/revoked accounts are denied", async () => {
  const f = await upload();
  expect(downloadChatFile(mom, f.id, req()).status).toBe(404);
  expect(() =>
    chatSend(mom, { text: "", clientRequestId: randomUUID(), attachmentIds: [f.id] }),
  ).toThrow();
  expect(() => downloadChatFile(undefined, f.id, req())).toThrow();
  await expect(upload(kid)).rejects.toThrow();
  endSession(dad);
  expect(() => downloadChatFile(dad, f.id, req())).toThrow();
  await expect(upload(dad)).rejects.toThrow();
});
it("checks concrete size limits, maximum five files and household quota", async () => {
  expect(CHAT_FILE_LIMITS).toEqual({ image: 10 * MB, video: 100 * MB, file: 25 * MB });
  for (const [name, size] of [
    ["a.png", 10 * MB + 1],
    ["a.mp4", 100 * MB + 1],
    ["a.pdf", 25 * MB + 1],
  ] as const)
    expect(() => checkFileInfo({ name, size, mime: "" })).toThrow();
  expect(() => fileIdsSchema.parse(Array.from({ length: 6 }, () => randomUUID()))).toThrow();
  process.env["TEXBOX_CHAT_QUOTA_MB"] = "1";
  await expect(
    uploadChatFile(
      dad,
      { name: "a.pdf", size: MB + 1, mime: "application/pdf" },
      stream(new Uint8Array()),
    ),
  ).rejects.toThrow(/tárhelykerete/);
  for (let i = 0; i < 5; i++) await upload();
  await expect(upload()).rejects.toThrow(/5/);
});
it("rejects truncated and oversized streams without creating partial messages", async () => {
  await expect(
    uploadChatFile(dad, { name: "a.png", size: 100, mime: "image/png" }, stream(png())),
  ).rejects.toThrow(/hiányos/);
  await expect(
    uploadChatFile(dad, { name: "a.png", size: 1, mime: "image/png" }, stream(png())),
  ).rejects.toThrow(/méret/);
  expect(draftFiles(dad)).toEqual([]);
  expect(chatList(dad).items).toEqual([]);
});
it("revocation during upload aborts and removes the partial file", async () => {
  let sent = false;
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      if (!sent) {
        sent = true;
        c.enqueue(png().slice(0, 10));
      } else {
        endSession(dad);
        c.enqueue(png().slice(10));
        c.close();
      }
    },
  });
  await expect(
    uploadChatFile(dad, { name: "a.png", size: png().length, mime: "image/png" }, body),
  ).rejects.toThrow();
  expect((db()?.prepare("SELECT COUNT(*) n FROM chat_attachments").get() as { n: number }).n).toBe(
    0,
  );
});
it("preserves metadata when file missing/deleted; delete requires owner/admin and audits", async () => {
  const f = await upload(mom);
  chatSend(mom, { text: "Fénykép", clientRequestId: randomUUID(), attachmentIds: [f.id] });
  expect(() => deleteChatFile(kid, f.id)).toThrow();
  rmSync(filePath(f.id));
  expect(chatList(dad).items[0]?.attachments[0]?.missing).toBe(true);
  deleteChatFile(mom, f.id);
  expect(chatList(dad).items[0]?.attachments[0]?.deleted).toBe(true);
  expect(downloadChatFile(dad, f.id, req()).status).toBe(404);
  expect(
    (db()?.prepare("SELECT action FROM audit_log WHERE target=?").get(f.id) as { action: string })
      .action,
  ).toBe("chat_file_delete");
});
it("disabled account loses access, range validates suffix and rejects multipart, CSRF denied", async () => {
  const f = await upload();
  chatSend(dad, { text: "photo", clientRequestId: randomUUID(), attachmentIds: [f.id] });
  updateUser(momId, { disabled: true });
  expect(() => downloadChatFile(mom, f.id, req())).toThrow();
  expect(parseRange("bytes=-5", 10)).toEqual({ start: 5, end: 9, partial: true });
  expect(() => parseRange("bytes=0-1,3-4", 10)).toThrow();
  expect(() =>
    sameOrigin(
      new Request("http://localhost/api/chat/upload", { headers: { origin: "https://evil.test" } }),
    ),
  ).toThrow();
  expect(() =>
    sameOrigin(
      new Request("http://172.17.0.2:3000/api/chat/upload", {
        headers: { origin: "https://tb.texbox.synology.me", host: "tb.texbox.synology.me" },
      }),
    ),
  ).not.toThrow();
  expect(() =>
    sameOrigin(
      new Request("http://localhost/api/chat/upload", {
        headers: { origin: "https://evil.test", "x-forwarded-host": "tb.texbox.synology.me" },
      }),
    ),
  ).toThrow();
});
it("no silent new attachment folder after missing NAS directory", async () => {
  await upload();
  rmSync(filesDir(), { recursive: true });
  await expect(upload()).rejects.toThrow(/hiányzik/);
  expect(existsSync(filesDir())).toBe(false);
});

it("accepts a genuine WebM signature", async () => {
  const data = new Uint8Array(
    Buffer.from(
      "GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAIwEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHYTbuMU6uEElTDZ1OsggElTbuMU6uEHFO7a1OsggIa7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsirXsYMPQkBNgI1MYXZmNjIuMTIuMTAyV0GNTGF2ZjYyLjEyLjEwMkSJiEBeAAAAAAAAFlSua8iuAQAAAAAAAD/XgQFzxYhQODLI1CPB+5yBACK1nIN1bmSIgQCGhVZfVlA4g4EBI+ODhAJiWgDgkLCBELqBEJqBAlWwhFW5gQESVMNn/HNzoGPAgGfImkWjh0VOQ09ERVJEh41MYXZmNjIuMTIuMTAyc3PWY8CLY8WIUDgyyNQjwftnyKFFo4dFTkNPREVSRIeUTGF2YzYyLjI4LjEwMiBsaWJ2cHhnyKFFo4hEVVJBVElPTkSHkzAwOjAwOjAwLjEyMDAwMDAwMAAfQ7Z17+eBAKO8gQAAgLACAJ0BKhAAEAAARwiFhYiFhIgCAgJ1qgP4Agz9KAD+/00S//xYV/FhX8WFf/FhX/z8zu3F/OYAo5WBACgAsQEABRCsABgAGFgv9AAIAACjlYEAUACxAQAFEKwAGAAYWC/0AAgAABxTu2uRu4+zgQC3iveBAfGCAabwgQM=",
      "base64",
    ),
  );
  const f = await upload(dad, "clip.webm", data, "video/webm");
  expect(f.kind).toBe("video");
  expect(f.mime).toBe("video/webm");
});
