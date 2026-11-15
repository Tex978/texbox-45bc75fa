// Minimal MD5 (hex) — Growatt's login needs it and WebCrypto has no MD5.
export function md5(str: string): string {
  const bytes = new TextEncoder().encode(str);
  const len = bytes.length, words: number[] = [];
  for (let i = 0; i < len; i++) words[i >> 2] = (words[i >> 2] || 0) | (bytes[i]! << ((i % 4) * 8));
  words[len >> 2] = (words[len >> 2] || 0) | (0x80 << ((len % 4) * 8));
  const n = (((len + 8) >> 6) + 1) * 16;
  for (let i = 0; i < n; i++) words[i] = words[i] || 0;
  words[n - 2] = len * 8;
  const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) | 0);
  let a0 = 0x67452301, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476;
  for (let o = 0; o < n; o += 16) {
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      let f: number, g: number;
      if (i < 16) { f = (b & c) | (~b & d); g = i; }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * i) % 16; }
      const s = S[(i >> 4) * 4 + (i % 4)]!;
      const t = (a + f + K[i]! + words[o + g]!) | 0;
      a = d; d = c; c = b; b = (b + ((t << s) | (t >>> (32 - s)))) | 0;
    }
    a0 = (a0 + a) | 0; b0 = (b0 + b) | 0; c0 = (c0 + c) | 0; d0 = (d0 + d) | 0;
  }
  return [a0, b0, c0, d0].map((v) => Array.from({ length: 4 }, (_, i) => ((v >>> (i * 8)) & 255).toString(16).padStart(2, "0")).join("")).join("");
}
