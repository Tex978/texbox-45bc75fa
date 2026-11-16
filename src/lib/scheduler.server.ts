// Background scheduler bootstrap for the self-hosted Node process (server entry imports this once).
let timer: ReturnType<typeof setInterval> | null = null;
export function startScheduler(intervalMs = 20_000) {
  if (timer || typeof process === "undefined" || !process.versions?.node) return false;
  if (process.env["TEXBOX_SCHEDULER"] === "off" || process.env["VITEST"]) return false;
  const worker = `${process.pid}-${crypto.randomUUID()}`;
  let busy = false;
  const run = async () => {
    if (busy) return;
    busy = true;
    try {
      const { db, isHostedAccountPreview } = await import("./auth.server");
      if (isHostedAccountPreview() || !db()) return;
      const { tick } = await import("./schedules.server");
      const { executeSceneStep } = await import("./scene-devices.server");
      await tick(worker, executeSceneStep);
    } catch (e) {
      console.error("scheduler tick failed", (e as Error).message);
    } finally {
      busy = false;
    }
  };
  timer = setInterval(() => void run(), intervalMs);
  timer.unref?.();
  void run();
  return true;
}
