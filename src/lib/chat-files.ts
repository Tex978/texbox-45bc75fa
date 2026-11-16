import { z } from "zod";
export const MB = 1024 * 1024;
export const CHAT_FILE_LIMITS = { image: 10 * MB, video: 100 * MB, file: 25 * MB } as const;
export const CHAT_MAX_FILES = 5;
export const CHAT_ACCEPT = ".jpg,.jpeg,.png,.webp,.mp4,.webm,.mov,.pdf,.txt,.docx,.xlsx,.zip";
export const fileInfoSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(180)
      .refine((v) => !v.includes("/") && !v.includes("\\") && !Array.from(v).some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127) && !v.startsWith("."), "Érvénytelen fájlnév."),
    size: z.number().int().positive().max(CHAT_FILE_LIMITS.video),
    mime: z.string().max(120),
  })
  .strict();
export type ChatFileInfo = z.infer<typeof fileInfoSchema>;
export type ChatFile = {
  id: string;
  name: string;
  size: number;
  mime: string;
  kind: "image" | "video" | "file";
  missing: boolean;
  deleted: boolean;
};
export const FILE_TYPES: Record<
  string,
  { mime: string; kind: ChatFile["kind"]; signature: string[] }
> = {
  jpg: { mime: "image/jpeg", kind: "image", signature: ["jpg"] },
  jpeg: { mime: "image/jpeg", kind: "image", signature: ["jpg"] },
  png: { mime: "image/png", kind: "image", signature: ["png"] },
  webp: { mime: "image/webp", kind: "image", signature: ["webp"] },
  mp4: { mime: "video/mp4", kind: "video", signature: ["mp4"] },
  webm: { mime: "video/webm", kind: "video", signature: ["webm"] },
  mov: { mime: "video/quicktime", kind: "file", signature: ["mov"] },
  pdf: { mime: "application/pdf", kind: "file", signature: ["pdf"] },
  txt: { mime: "text/plain", kind: "file", signature: ["txt"] },
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    kind: "file",
    signature: ["docx"],
  },
  xlsx: {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    kind: "file",
    signature: ["xlsx"],
  },
  zip: { mime: "application/zip", kind: "file", signature: ["zip"] },
};
export function checkFileInfo(input: ChatFileInfo) {
  const info = fileInfoSchema.parse(input);
  const ext = info.name.split(".").at(-1)?.toLowerCase() ?? "";
  const type = FILE_TYPES[ext];
  if (!type)
    throw new Error(
      "Ez a fájltípus nem küldhető. Kép, MP4/WebM videó, MOV, PDF, TXT, DOCX, XLSX vagy ZIP választható.",
    );
  const max = ext === "mov" ? CHAT_FILE_LIMITS.video : CHAT_FILE_LIMITS[type.kind];
  if (info.size > max) throw new Error(`A fájl túl nagy: legfeljebb ${max / MB} MB lehet.`);
  if (
    info.mime &&
    info.mime !== "application/octet-stream" &&
    info.mime !== type.mime &&
    !(ext === "zip" && info.mime === "application/x-zip-compressed")
  )
    throw new Error("A megadott fájltípus nem egyezik a kiterjesztéssel.");
  return { info, type, ext, max };
}
export const fileIdsSchema = z
  .array(z.string().uuid())
  .max(CHAT_MAX_FILES)
  .refine((v) => new Set(v).size === v.length, "Egy fájl csak egyszer csatolható.");
export function chatFileUrl(id: string, download = false) {
  return `/api/chat/file/${encodeURIComponent(id)}${download ? "?download=1" : ""}`;
}
