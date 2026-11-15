import type { ChildProcessWithoutNullStreams } from "node:child_process";
type Config = { brand: "vw" | "renault"; user: string; password: string; locale: string };
export type VehicleReading = { vehicles: { id: string; name: string; battery: number | null; fuel: number | null; range: number | null; odometer: number | null; charging: string | null; error?: string }[]; error: string; verification: boolean; updatedAt: string | null };
let child: ChildProcessWithoutNullStreams | undefined;
let starting: Promise<ChildProcessWithoutNullStreams> | undefined;
let buffer = "";
let sequence = 0;
const pending = new Map<number, { resolve: (result: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();

async function bridge() {
  if (child) return child;
  if (starting) return starting;
  starting = (async () => {
    // The Python helper ships only in the user's Docker image, not the hosted Worker.
    const { spawn } = await import(/* @vite-ignore */ "node:" + "child_process");
    const { existsSync } = await import(/* @vite-ignore */ "node:" + "fs");
    if (!existsSync("/app/scripts/vehicles_cloud.py")) throw new Error("A autós fiókos kapcsolat a frissített Synology alkalmazásban használható.");
    const proc = spawn("/opt/vehicles/bin/python", ["-u", "/app/scripts/vehicles_cloud.py"], { stdio: ["pipe", "pipe", "pipe"] });
    child = proc;
    buffer = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      let end = buffer.indexOf("\n");
      while (end >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        try {
          const reply = JSON.parse(line) as { id: number; result?: unknown; error?: string };
          const task = pending.get(reply.id);
          if (task) { clearTimeout(task.timer); pending.delete(reply.id); if (reply.error) task.reject(new Error(reply.error)); else task.resolve(reply.result); }
        } catch { /* Non-protocol output is discarded, never logged. */ }
        end = buffer.indexOf("\n");
      }
    });
    proc.stderr.on("data", () => { /* Never log credentials or third-party diagnostics. */ });
    const fail = () => {
      if (child !== proc) return;
      child = undefined;
      for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error("Megszakadt a autós kapcsolat. Próbáld újra.")); }
      pending.clear();
    };
    proc.on("error", fail); proc.on("exit", fail);
    return proc;
  })();
  try { return await starting; } finally { starting = undefined; }
}

async function request(config: Config, code?: string): Promise<unknown> {
  const proc = await bridge();
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { proc.kill(); reject(new Error("A autós kérés túl sokáig tartott. Próbáld újra később.")); }, 180_000);
    pending.set(id, { resolve, reject, timer });
    proc.stdin.write(JSON.stringify({ id, config, code }) + "\n", (error) => {
      if (error) { clearTimeout(timer); pending.delete(id); reject(new Error("Nem indult el a autós kapcsolat.")); }
    });
  });
}
export async function readVehicles(config: Config, code?: string) { return await request(config, code) as VehicleReading; }
