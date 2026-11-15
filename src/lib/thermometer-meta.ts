export type ThermometerMeta = Record<string, { name?: string; room?: string; hidden?: boolean }>;
export function visibleThermometers<T extends { did: string }>(sensors: T[], meta: ThermometerMeta): T[] {
  return sensors.filter(sensor => meta[sensor.did]?.hidden !== true);
}
export function mergeThermometerMeta(current: ThermometerMeta, items: ThermometerMeta, onlyMissing = false): ThermometerMeta {
  const next = { ...current };
  for (const [did, item] of Object.entries(items)) {
    if (!did || did.length > 100 || (onlyMissing && next[did])) continue;
    next[did] = { ...next[did],
      ...(typeof item.name === "string" ? { name: item.name.trim().slice(0, 60) } : {}),
      ...(typeof item.room === "string" ? { room: item.room.trim().slice(0, 40) } : {}),
      ...(typeof item.hidden === "boolean" ? { hidden: item.hidden } : {}),
    };
  }
  return next;
}