export const GREE_MODES = ["auto", "cool", "heat", "dry", "fan_only"] as const;
export const GREE_FANS = ["auto", "low", "mediumLow", "medium", "mediumHigh", "high"] as const;
export type GreeUnit = { ip: string; name: string };
export function parseGreeUnits(raw: string): GreeUnit[] {
  const units = raw.split(/[,\n]+/).map((line) => {
    const [ip = "", ...name] = line.trim().split("=");
    return { ip: ip.trim(), name: name.join("=").trim() || ip.trim() };
  }).filter((unit) => unit.ip);
  if (units.length > 20 || units.some(({ ip }) => !/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip) || ip.split(".").length !== 4 || ip.split(".").some((part) => !/^\d+$/.test(part) || Number(part) > 255))) throw new Error("A klímákhoz érvényes otthoni IP-címeket adj meg.");
  return units;
}
export function validateGreeCommand(input: { ip: string; property: string; value: string | number }) {
  if (!/^[a-f0-9]{12,24}$/i.test(input.ip)) parseGreeUnits(input.ip);
  const valid = input.property === "power" ? ["on", "off"].includes(String(input.value))
    : input.property === "temperature" ? typeof input.value === "number" && Number.isInteger(input.value) && input.value >= 16 && input.value <= 30
    : input.property === "mode" ? GREE_MODES.some((mode) => mode === input.value)
    : input.property === "fanSpeed" ? GREE_FANS.some((fan) => fan === input.value) : false;
  if (!valid) throw new Error("Érvénytelen klímabeállítás.");
  return input;
}