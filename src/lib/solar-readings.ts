export type SolarFlow = {
  pv: number | null;
  soc: number | null;
  charge: number | null;
  discharge: number | null;
  load: number | null;
  toGrid: number | null;
  fromGrid: number | null;
};
export function parseSolarFlow(o: Record<string, unknown>): SolarFlow {
  const number = (...keys: string[]) => {
    for (const key of keys) {
      const raw = o[key];
      if (raw == null || raw === "") continue;
      const value = parseFloat(String(raw));
      if (Number.isFinite(value)) return value;
    }
    return null;
  };
  const kw = (...keys: string[]) => {
    const value = number(...keys);
    return value === null ? null : value * 1000;
  };
  return {
    pv: kw("ppv", "pPv", "pvPower"),
    soc: number("SOC", "soc", "capacity"),
    charge: kw("chargePower", "pCharge"),
    discharge: kw("pdisCharge1", "pdisCharge", "pDischarge"),
    load: kw("pLocalLoad", "pLoad", "loadPower"),
    toGrid: kw("pactogrid", "pToGrid"),
    fromGrid: kw("pactouser", "pToUser"),
  };
}
