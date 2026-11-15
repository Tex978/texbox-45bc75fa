import type { ChildProcessWithoutNullStreams } from "node:child_process";
type Config = { user: string; password: string; region: string };
export type CloudReading = { configured: boolean; error: string; units: { ip: string; name: string; online: boolean; properties: Record<string, string | number>; error: string }[] };
type Command = { ip: string; property: string; value: string | number };
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
    if (!existsSync("/app/scripts/gree_cloud.py")) throw new Error("A Gree+ fiókos kapcsolat a frissített Synology alkalmazásban használható.");
    const proc = spawn("/opt/gree/bin/python", ["-u", "/app/scripts/gree_cloud.py"], { stdio: ["pipe", "pipe", "pipe"] });
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
      for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error("Megszakadt a Gree+ kapcsolat. Próbáld újra.")); }
      pending.clear();
    };
    proc.on("error", fail); proc.on("exit", fail);
    return proc;
  })();
  try { return await starting; } finally { starting = undefined; }
}

async function request(config: Config, action: "read" | "control", command?: Command): Promise<unknown> {
  const proc = await bridge();
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { proc.kill(); reject(new Error("A Gree+ kérés túl sokáig tartott. Próbáld újra később.")); }, 180_000);
    pending.set(id, { resolve, reject, timer });
    proc.stdin.write(JSON.stringify({ id, config, action, command }) + "\n", (error) => {
      if (error) { clearTimeout(timer); pending.delete(id); reject(new Error("Nem indult el a Gree+ kapcsolat.")); }
    });
  });
}
export async function readGreeCloud(config: Config) { return await request(config, "read") as CloudReading; }
export async function controlGreeCloud(config: Config, command: Command) { await request(config, "control", command); }