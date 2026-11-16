import * as f from "node:fs";

/** Dependency-free magic-byte detection for the chat's allowed file types. */
export function detectFileExt(path: string): string | null {
  const fd = f.openSync(path, "r");
  try {
    const size = f.fstatSync(fd).size;
    const head = Buffer.alloc(Math.min(size, 4096));
    f.readSync(fd, head, 0, head.length, 0);
    const tailLen = Math.min(size, 65536);
    const tail = Buffer.alloc(tailLen);
    f.readSync(fd, tail, 0, tailLen, size - tailLen);
    return detectBuffers(head, tail);
  } finally {
    f.closeSync(fd);
  }
}

export function detectBuffers(head: Buffer, tail: Buffer = head): string | null {
  const at = (s: string, o = 0) => head.subarray(o, o + s.length).toString("latin1") === s;
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpg";
  if (at("\x89PNG\r\n\x1a\n")) return "png";
  if (at("RIFF") && at("WEBP", 8)) return "webp";
  if (at("%PDF-")) return "pdf";
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
    return head.toString("latin1").includes("webm") ? "webm" : null;
  }
  if (at("ftyp", 4)) {
    const brand = head.subarray(8, 12).toString("latin1");
    return brand === "qt  " ? "mov" : "mp4";
  }
  if (at("PK\x03\x04")) {
    const text = head.toString("latin1") + tail.toString("latin1");
    if (text.includes("[Content_Types].xml")) {
      if (text.includes("word/")) return "docx";
      if (text.includes("xl/")) return "xlsx";
    }
    return "zip";
  }
  return null;
}
