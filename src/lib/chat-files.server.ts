import {
  db,
  requirePermission,
  SESSION_COOKIE,
  isHostedAccountPreview,
  type User,
} from "./auth.server";
import { dataDir } from "./data-guard.server";
import { checkFileInfo, type ChatFileInfo, type ChatFile } from "./chat-files";
import { z } from "zod";
const builtin = <T>(name: string) => {
  const m = globalThis.process?.getBuiltinModule?.(name);
  if (!m) throw new Error("A fájltárolás csak a saját NAS-on érhető el.");
  return m as T;
};
const fs = () => builtin<typeof import("node:fs")>("node:fs");
const crypto = () => builtin<typeof import("node:crypto")>("node:crypto");
const validId = (id: string) => z.string().uuid().parse(id);
export const filesDir = () => `${dataDir()}/chat-attachments`;
export function filePath(id: string) {
  if (fs().existsSync(filesDir())) {
    const s = fs().lstatSync(filesDir());
    if (s.isSymbolicLink() || !s.isDirectory())
      throw new Error("A chat fájlmappája nem biztonságos.");
  }
  return `${filesDir()}/${validId(id)}`;
}
export function chatFileAccess(token: string | undefined, write = false) {
  if (isHostedAccountPreview()) throw new Error("A fájlok csak a saját NAS-on tárolhatók.");
  const user = requirePermission(token),
    d = db();
  if (!user || !d) throw new Error("Bejelentkezés szükséges.");
  if (write && user.role === "child")
    throw new Error("Gyermekfiókkal a chat egyelőre csak olvasható.");
  return { user, d };
}
export type FileRow = {
  id: string;
  sender_id: string;
  message_id: number | null;
  name: string;
  size: number;
  mime: string;
  kind: ChatFile["kind"];
  status: string;
  created_at: number;
};
const row = (id: string) =>
  db()?.prepare("SELECT * FROM chat_attachments WHERE id=?").get(validId(id)) as
    FileRow | undefined;
export function fileDto(r: FileRow): ChatFile {
  let missing = true;
  try {
    const s = fs().lstatSync(filePath(r.id));
    missing = !s.isFile() || s.isSymbolicLink() || s.size !== r.size;
  } catch {
    /* explicitly missing */
  }
  return {
    id: r.id,
    name: r.name,
    size: r.size,
    mime: r.mime,
    kind: r.kind,
    missing,
    deleted: r.status === "deleted",
  };
}
export function attachmentsFor(ids: number[]) {
  const d = db();
  if (!d || !ids.length) return [];
  return d
    .prepare(
      `SELECT * FROM chat_attachments WHERE message_id IN (${ids.map(() => "?").join(",")}) ORDER BY created_at,id`,
    )
    .all(...ids) as FileRow[];
}
function ensureFolder() {
  const f = fs(),
    dir = filesDir();
  if (!f.existsSync(dir)) {
    if (db()?.prepare("SELECT 1 FROM chat_attachments LIMIT 1").get())
      throw new Error(
        "A chat fájlmappája hiányzik. Ellenőrizd a NAS adattárolóját; nem hozunk létre üres helyettesítőt.",
      );
    f.mkdirSync(dir, { mode: 0o700 });
  }
  const s = f.lstatSync(dir);
  if (!s.isDirectory() || s.isSymbolicLink())
    throw new Error("A chat fájlmappája nem biztonságos.");
}
export async function uploadChatFile(
  token: string | undefined,
  input: ChatFileInfo,
  body: ReadableStream<Uint8Array> | null,
) {
  const { user, d } = chatFileAccess(token, true);
  const { info, type, ext, max } = checkFileInfo(input);
  if (!body) throw new Error("Hiányzó fájltartalom.");
  ensureFolder();
  const configured = Number(globalThis.process?.env["TEXBOX_CHAT_QUOTA_MB"] ?? 2048);
  if (!Number.isFinite(configured) || configured < 1)
    throw new Error("A chat tárhelykerete érvénytelen.");
  const quota = configured * 1024 * 1024,
    id = crypto().randomUUID();
  d.exec("BEGIN IMMEDIATE");
  try {
    const used = Number(
      (
        d
          .prepare("SELECT COALESCE(SUM(size),0) n FROM chat_attachments WHERE status<>'deleted'")
          .get() as { n: number }
      ).n,
    );
    if (used + info.size > quota) throw new Error("A családi chat tárhelykerete megtelt.");
    const pending = Number(
      (
        d
          .prepare(
            "SELECT COUNT(*) n FROM chat_attachments WHERE sender_id=? AND message_id IS NULL AND status<>'deleted'",
          )
          .get(user.id) as { n: number }
      ).n,
    );
    if (pending >= 5)
      throw new Error(
        "Legfeljebb 5 elküldetlen csatolmány tölthető fel. Töröld a korábbi piszkozatokat.",
      );
    d.prepare(
      "INSERT INTO chat_attachments(id,sender_id,name,size,mime,kind,status,created_at) VALUES(?,?,?,?,?,?,'uploading',?)",
    ).run(id, user.id, info.name, info.size, type.mime, type.kind, Date.now());
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
  const f = fs();
  let fd: number | undefined;
  let total = 0;
  const reader = body.getReader();
  const deadline = Date.now() + 10 * 60 * 1000;
  try {
    fd = f.openSync(
      filePath(id),
      f.constants.O_WRONLY | f.constants.O_CREAT | f.constants.O_EXCL | f.constants.O_NOFOLLOW,
      0o600,
    );
    while (true) {
      if (Date.now() > deadline) throw new Error("A feltöltés túllépte az időkorlátot.");
      let timer: ReturnType<typeof setTimeout> | undefined;
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error("A feltöltés túl sokáig nem továbbított adatot.")),
              60000,
            );
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
      const { value, done } = chunk;
      if (done) break;
      chatFileAccess(token, true);
      total += value.byteLength;
      if (total > info.size || total > max)
        throw new Error("A feltöltés meghaladja a megengedett méretet.");
      let offset = 0;
      while (offset < value.byteLength)
        offset += f.writeSync(fd, value, offset, value.byteLength - offset);
    }
    if (total !== info.size) throw new Error("A feltöltés megszakadt: hiányos fájl.");
    f.fsyncSync(fd);
    f.closeSync(fd);
    fd = undefined;
    if (ext === "txt") {
      const handle = f.openSync(filePath(id), f.constants.O_RDONLY | f.constants.O_NOFOLLOW);
      try {
        const buffer = new Uint8Array(Math.min(total, 8192));
        f.readSync(handle, buffer);
        const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer, {
          stream: total > 8192,
        });
        if (
          Array.from(text).some((c) => {
            const n = c.charCodeAt(0);
            return n < 32 && n !== 9 && n !== 10 && n !== 13;
          }) ||
          /<\s*(?:!doctype|html|script|svg)|^\s*#!/i.test(text)
        )
          throw new Error("Aktív vagy nem szöveges fájl nem küldhető TXT-ként.");
      } finally {
        f.closeSync(handle);
      }
    } else {
      const { fileTypeFromFile } = await import("file-type");
      const detected = await fileTypeFromFile(filePath(id));
      if (!detected || !type.signature.includes(detected.ext))
        throw new Error("A fájl tartalma nem egyezik a megadott típusával.");
    }
    chatFileAccess(token, true);
    if (row(id)?.status !== "uploading") throw new Error("A feltöltést másik eszközön törölték.");
    d.prepare("UPDATE chat_attachments SET status='ready' WHERE id=? AND status='uploading'").run(
      id,
    );
    return fileDto({ ...(row(id) as FileRow) });
  } catch (e) {
    await reader.cancel().catch(() => undefined);
    if (fd !== undefined) f.closeSync(fd);
    try {
      f.unlinkSync(filePath(id));
    } catch {
      /* metadata remains if disk cleanup fails */
    }
    if (!f.existsSync(filePath(id)))
      d.prepare("DELETE FROM chat_attachments WHERE id=? AND message_id IS NULL").run(id);
    throw e;
  } finally {
    reader.releaseLock();
  }
}
export function checkAttachments(user: User, ids: string[]) {
  const d = db();
  if (!d) throw new Error("A fájltároló nem érhető el.");
  for (const id of ids) {
    const r = row(id);
    if (
      !r ||
      r.sender_id !== user.id ||
      r.message_id !== null ||
      r.status !== "ready" ||
      fileDto(r).missing
    )
      throw new Error("Hiányzó, már elküldött vagy másik fiókhoz tartozó csatolmány.");
  }
}
export function deleteChatFile(token: string | undefined, id: string) {
  const { user, d } = chatFileAccess(token, true),
    r = row(id);
  if (!r || r.status === "deleted") throw new Error("A fájl nem található.");
  if (r.sender_id !== user.id && user.role !== "admin")
    throw new Error("Csak a küldő vagy az admin törölheti a fájlt.");
  d.exec("BEGIN IMMEDIATE");
  try {
    d.prepare("UPDATE chat_attachments SET status='deleted' WHERE id=?").run(id);
    d.prepare("INSERT INTO audit_log(user_id,action,target,at) VALUES(?,?,?,?)").run(
      user.id,
      "chat_file_delete",
      id,
      Date.now(),
    );
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
  try {
    fs().unlinkSync(filePath(id));
  } catch (e) {
    if ((e as { code?: string }).code !== "ENOENT")
      throw new Error(
        "A fájl elérése megszűnt, de a fizikai törlés nem sikerült; ellenőrizd a NAS-t.",
      );
  }
}
export function draftFiles(token: string | undefined) {
  const { user, d } = chatFileAccess(token);
  return (
    d
      .prepare(
        "SELECT * FROM chat_attachments WHERE sender_id=? AND message_id IS NULL AND status<>'deleted' ORDER BY created_at",
      )
      .all(user.id) as FileRow[]
  ).map(fileDto);
}
export function parseRange(range: string | null, size: number) {
  if (!range) return { start: 0, end: size - 1, partial: false };
  const m = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!m || (!m[1] && !m[2])) throw new Error("Érvénytelen videótartomány.");
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  const end = m[1] ? (m[2] ? Math.min(Number(m[2]), size - 1) : size - 1) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start ||
    (!m[1] && Number(m[2]) <= 0)
  )
    throw new Error("Érvénytelen videótartomány.");
  return { start, end, partial: true };
}
export function downloadChatFile(token: string | undefined, id: string, request: Request) {
  const { user } = chatFileAccess(token),
    r = row(id);
  if (!r || r.status !== "ready" || (r.message_id === null && r.sender_id !== user.id))
    return new Response("A fájl nem érhető el.", { status: 404 });
  if (fileDto(r).missing) return new Response("A fájl hiányzik a NAS-ról.", { status: 404 });
  let range;
  try {
    range = parseRange(request.headers.get("range"), r.size);
  } catch {
    return new Response("Érvénytelen tartomány.", {
      status: 416,
      headers: { "Content-Range": `bytes */${r.size}` },
    });
  }
  const inline = r.kind === "image" || r.kind === "video";
  const headers = new Headers({
    "Content-Type": r.mime,
    "Content-Length": String(range.end - range.start + 1),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Accept-Ranges": "bytes",
    "Content-Disposition": `${inline && !new URL(request.url).searchParams.has("download") ? "inline" : "attachment"}; filename="file"; filename*=UTF-8''${encodeURIComponent(r.name).replace(/['()]/g, (c) => "%" + c.charCodeAt(0).toString(16))}`,
  });
  if (range.partial) headers.set("Content-Range", `bytes ${range.start}-${range.end}/${r.size}`);
  const f = fs(),
    fd = f.openSync(filePath(id), f.constants.O_RDONLY | f.constants.O_NOFOLLOW);
  let position = range.start,
    closed = false;
  const close = () => {
    if (!closed) {
      closed = true;
      f.closeSync(fd);
    }
  };
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      try {
        chatFileAccess(token);
        if (row(id)?.status !== "ready") throw new Error("A fájl elérése megszűnt.");
        const b = new Uint8Array(Math.min(64 * 1024, range.end - position + 1));
        const n = f.readSync(fd, b, 0, b.length, position);
        if (!n) {
          close();
          controller.close();
          return;
        }
        position += n;
        controller.enqueue(b.subarray(0, n));
        if (position > range.end) {
          close();
          controller.close();
        }
      } catch (e) {
        close();
        controller.error(e);
      }
    },
    cancel() {
      close();
    },
  });
  return new Response(stream, { status: range.partial ? 206 : 200, headers });
}
export function requestToken(request: Request) {
  return (request.headers.get("cookie") ?? "")
    .split(/;\s*/)
    .find((v) => v.startsWith(SESSION_COOKIE + "="))
    ?.slice(SESSION_COOKIE.length + 1);
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  let host = "";
  try {
    host = origin ? new URL(origin).host.toLowerCase() : "";
  } catch {
    host = "";
  }
  // Behind a reverse proxy (Synology) request.url is the internal address, so
  // accept the public host the proxy forwarded as well.
  const allowed = new Set(
    [
      new URL(request.url).host,
      request.headers.get("host"),
      ...(request.headers.get("x-forwarded-host") ?? "").split(","),
    ]
      .map((h) => (h ?? "").trim().toLowerCase())
      .filter(Boolean),
  );
  if (request.headers.get("sec-fetch-site") === "same-origin" && host) return;
  if (!host || !allowed.has(host))
    throw new Error("A feltöltés csak a TexBox saját oldaláról engedélyezett.");
}
export function fileError(e: unknown) {
  return Response.json(
    {
      error:
        e instanceof Error &&
        e.name !== "ZodError" &&
        !/SQLITE|ENOENT|EACCES|\/data\//.test(e.message)
          ? e.message
          : "Érvénytelen fájladatok vagy nem elérhető NAS-fájltároló.",
    },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}
