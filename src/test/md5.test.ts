import { describe, it, expect } from "vitest";
import { md5 } from "@/lib/md5";
describe("md5", () => {
  it("matches known hashes", () => {
    expect(md5("")).toBe("d41d8cd98f00b204e9800998ecf8427e");
    expect(md5("The quick brown fox jumps over the lazy dog")).toBe("9e107d9d372bb6826bd81d3542a419d6");
  });
});
