import { parseGreeUnits, validateGreeCommand } from "./gree-rules";
export async function commandGree(
  env: (key: string) => string,
  data: { ip: string; property: string; value: string | number },
) {
  validateGreeCommand(data);
  if (env("GREE_USER") && env("GREE_PASS")) {
    const { controlGreeCloud } = await import("./gree-cloud.server");
    await controlGreeCloud(
      {
        user: env("GREE_USER"),
        password: env("GREE_PASS"),
        region: env("GREE_REGION") || "Europe",
      },
      data,
    );
  } else {
    if (!parseGreeUnits(env("GREE_UNITS")).some((u) => u.ip === data.ip))
      throw new Error("Ez a klíma nincs beállítva.");
    const { withGree } = await import("./gree.server");
    await withGree(data.ip, {
      [data.property]: data.value,
      ...(data.property === "temperature" ? { temperatureUnit: "celsius" } : {}),
    });
  }
}
export async function commandBlind(
  env: (key: string) => string,
  data: { mac: string; deviceType: string; action: string; position?: number },
) {
  if (!env("BLINDS_IP")) throw new Error("Nincs redőnykapcsolat beállítva.");
  const { writeBlind } = await import("./blinds.server");
  await writeBlind(
    env("BLINDS_IP"),
    env("BLINDS_KEY"),
    data.mac,
    data.deviceType,
    data.action === "position"
      ? { targetPosition: Math.max(0, Math.min(100, Math.round(data.position ?? 0))) }
      : { operation: data.action === "open" ? 1 : data.action === "close" ? 0 : 2 },
  );
}
