export type HistoryPoint = { time: number; temp?: number; hum?: number };
export function decodeHistoryValue(raw: unknown, key: string): Partial<HistoryPoint> {
  let value: unknown;
  try { value = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return {}; }
  if (Array.isArray(value)) value = value[0];
  if (key.includes(".")) {
    const number = Number(value);
    return value != null && value !== "" && Number.isFinite(number) ? { [key.endsWith("1002") || key.endsWith(".2") ? "hum" : "temp"]: number } : {};
  }
  if (typeof value !== "string" || !/^(?:[0-9a-f]{2})+$/i.test(value)) return {};
  const read = (offset: number) => {
    const n = parseInt(value.slice(offset + 2, offset + 4) + value.slice(offset, offset + 2), 16);
    return (n > 32767 ? n - 65536 : n) / 10;
  };
  if (key === "4109" && value.length >= 8) return { temp: read(0), hum: read(4) };
  if (value.length < 4) return {};
  return key === "4100" ? { temp: read(0) } : key === "4102" ? { hum: read(0) } : {};
}