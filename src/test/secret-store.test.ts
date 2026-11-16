import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { encryptValue, decryptValue } from "@/lib/shared-store.server";
describe("connection secrets at rest", () => {
  const key = createHash("sha256").update("k").digest();
  it("encrypts and decrypts with the same key, without plaintext in the file value", () => {
    const enc = encryptValue('{"QBIT_PASS":"titok"}', key);
    expect(enc).not.toContain("titok");
    expect(decryptValue(enc, key)).toBe('{"QBIT_PASS":"titok"}');
  });
  it("refuses a missing or wrong key", () => {
    const enc = encryptValue("x", key);
    expect(() => decryptValue(enc, null)).toThrow("TEXBOX_SECRET_KEY");
    expect(() => decryptValue(enc, createHash("sha256").update("masik").digest())).toThrow("nem egyezik");
  });
});
