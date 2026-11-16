// Background scheduler bootstrap for the self-hosted Node process (the server entry calls this; idempotent).
let started: Promise<boolean> | null = null;
export function startScheduler(intervalMs = 20_000) {
  if (started) return started;
  started = (async () => {
    if (typeof process === "undefined" || !process.versions?.node) return false;
    if (process.env["TEXBOX_SCHEDULER"] === "off" || process.env["VITEST"]) return false;
    const auth = await import("./auth.server");
    // Hosted Workers previews never schedule or control devices.
    if (auth.isHostedAccountPreview()) return false;
    const worker = `${process.pid}-${crypto.randomUUID()}`;
    let busy = false;
    const run = async () => {
      if (busy) return;
      busy = true;
      try {
        if (!auth.db()) return;
        const { tick } = await import("./schedules.server");
        const { executeSceneStep } = await import("./scene-devices.server");
        await tick(worker, executeSceneStep);
      } catch (e) {
        console.error("scheduler tick failed", (e as Error).message);
      } finally {
        busy = false;
      }
    };
    console.log(`TexBox scheduler started (worker ${worker})`);
    const timer = setInterval(() => void run(), intervalMs);
    timer.unref?.();
    void run();
    return true;
  })();
  return started;
}
