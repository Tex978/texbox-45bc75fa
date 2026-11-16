import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createUser,
  createSession,
  resetAuthDb,
  sessionUser,
  updateUser,
  type User,
} from "@/lib/auth.server";
import {
  saveScene,
  listScenes,
  deleteScene,
  runScene,
  readRuns,
  setDeviceAcl,
} from "@/lib/scenes.server";
import { assertDeviceAccess, withDeviceLock } from "@/lib/device-access.server";
import { type SceneInput, type DeviceCapability } from "@/lib/scene-schema";
let dir: string, admin: User, adult: User, child: User;
const devices: [DeviceCapability, DeviceCapability] = [
  { key: "gree:192.168.1.2", name: "Klíma", online: true, actions: ["power", "temperature"] },
  { key: "blind:abc", name: "Redőny", online: true, actions: ["open", "position"] },
];
const input = (): SceneInput => ({
  name: "Este",
  icon: "moon",
  color: "primary",
  visibility: "family",
  allowedUsers: [],
  steps: [{ device: devices[0].key, action: "power", value: "off" }],
});
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "texbox-scenes-"));
  process.env["DATA_DIR"] = dir;
  resetAuthDb();
  admin = createUser({ username: "apa", displayName: "Apa", role: "admin" });
  adult = createUser({ username: "anya", displayName: "Anya", role: "adult" });
  child = createUser({ username: "bence", displayName: "Bence", role: "child" });
});
afterEach(() => {
  resetAuthDb();
  rmSync(dir, { recursive: true, force: true });
});
describe("saved manual NAS scenes", () => {
  it("preserves accounts and sessions during scene CRUD and restart", () => {
    const token = createSession(admin.id, "test");
    const s = saveScene(admin, input(), devices);
    resetAuthDb();
    expect(sessionUser(token)?.id).toBe(admin.id);
    expect(listScenes(admin)[0]?.name).toBe("Este");
    saveScene(admin, { ...s, name: "Jó éjszakát" }, devices);
    expect(listScenes(admin)[0]?.name).toBe("Jó éjszakát");
    deleteScene(admin, s.id);
    expect(listScenes(admin)).toEqual([]);
  });
  it("does not expose personal scenes to other adults", () => {
    const s = saveScene(admin, { ...input(), visibility: "personal" }, devices);
    expect(listScenes(adult)).toEqual([]);
    expect(() => deleteScene(adult, s.id)).toThrow();
  });
  it("family admins may edit shared adult scenes, other adults cannot", () => {
    const s = saveScene(adult, input(), devices);
    saveScene(admin, { ...s, name: "Családi este" }, devices);
    const other = createUser({ username: "masik", displayName: "Másik", role: "adult" });
    expect(() => saveScene(other, { ...s, name: "Tiltott" }, devices)).toThrow(
      "nem szerkesztheted",
    );
  });
  it("children require explicit scene and underlying device grants", async () => {
    const s = saveScene(admin, { ...input(), allowedUsers: [child.id] }, devices),
      execute = vi.fn(async () => {});
    await expect(runScene(child, s.id, crypto.randomUUID(), execute)).rejects.toThrow(
      "külön engedély",
    );
    expect(execute).not.toHaveBeenCalled();
    setDeviceAcl(admin, child.id, devices[0].key, true);
    await runScene(child, s.id, crypto.randomUUID(), execute);
    expect(execute).toHaveBeenCalledOnce();
    expect(() => saveScene(child, input(), devices)).toThrow("jelenetszerkesztési");
  });
  it("scene grant alone never permits direct child device calls", () => {
    expect(() => assertDeviceAccess(child, devices[0].key)).toThrow();
    setDeviceAcl(admin, child.id, devices[0].key, true);
    expect(() => assertDeviceAccess(child, devices[0].key)).not.toThrow();
    setDeviceAcl(admin, adult.id, devices[0].key, false);
    expect(() => assertDeviceAccess(adult, devices[0].key)).toThrow();
    expect(() => setDeviceAcl(child, child.id, devices[0].key, true)).toThrow("csak admin");
  });
  it("records partial API failures without marking them successful", async () => {
    const s = saveScene(
      admin,
      {
        ...input(),
        steps: [...input().steps, { device: devices[1].key, action: "open", value: 0 }],
      },
      devices,
    );
    await runScene(admin, s.id, crypto.randomUUID(), async (step) => {
      if (step.device === devices[1].key) throw new Error("A hub nem válaszolt.");
    });
    expect(readRuns(admin, s.id)[0]).toMatchObject({
      status: "partial",
      results: [{ status: "accepted" }, { status: "failed", message: "A hub nem válaszolt." }],
    });
  });
  it("reuses an idempotency key and rejects parallel scene/device execution", async () => {
    const s = saveScene(admin, input(), devices),
      key = crypto.randomUUID();
    let finish: () => void = () => {};
    const execute = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const first = runScene(admin, s.id, key, execute);
    await Promise.resolve();
    await expect(runScene(admin, s.id, crypto.randomUUID(), execute)).rejects.toThrow("már fut");
    await expect(withDeviceLock(devices[0].key, async () => {})).rejects.toThrow("folyamatban");
    finish();
    await first;
    await runScene(admin, s.id, key, execute);
    expect(execute).toHaveBeenCalledOnce();
  });
  it("rechecks permissions before each step", async () => {
    const s = saveScene(
      admin,
      { ...input(), steps: [...input().steps, ...input().steps] },
      devices,
    );
    let count = 0;
    await runScene(adult, s.id, crypto.randomUUID(), async () => {
      count++;
      setDeviceAcl(admin, adult.id, devices[0].key, false);
    });
    expect(count).toBe(1);
    expect(readRuns(adult, s.id)[0]?.status).toBe("partial");
  });
  it("never executes old snapshot steps after the scene changes during a run", async () => {
    const s = saveScene(
      admin,
      { ...input(), steps: [...input().steps, ...input().steps] },
      devices,
    );
    let commands = 0;
    await runScene(adult, s.id, crypto.randomUUID(), async () => {
      commands++;
      saveScene(
        admin,
        { ...s, steps: [{ device: devices[1].key, action: "open", value: 0 }] },
        devices,
      );
      setDeviceAcl(admin, adult.id, devices[0].key, false);
    });
    expect(commands).toBe(1);
    expect(readRuns(adult, s.id)[0]?.status).toBe("partial");
  });
  it("reauthorization rejects a changed scene before an adapter sends a command", async () => {
    const s = saveScene(admin, input(), devices);
    let commands = 0;
    await runScene(adult, s.id, crypto.randomUUID(), async (_step, reauthorize) => {
      saveScene(admin, { ...s, name: "Módosítva" }, devices);
      reauthorize();
      commands++;
    });
    expect(commands).toBe(0);
    expect(readRuns(adult, s.id)[0]?.status).toBe("failed");
  });
  it("validates temperature and does not allow unsupported brightness", () => {
    expect(() =>
      saveScene(
        admin,
        { ...input(), steps: [{ device: devices[0].key, action: "temperature", value: 31 }] },
        devices,
      ),
    ).toThrow();
    expect(() =>
      saveScene(
        admin,
        { ...input(), steps: [{ device: devices[0].key, action: "position", value: 50 }] },
        devices,
      ),
    ).toThrow("nem támogatja");
  });
  it("optimistic revision prevents overwriting another editor", () => {
    const s = saveScene(admin, input(), devices);
    saveScene(admin, { ...s, name: "Új" }, devices);
    expect(() => saveScene(admin, { ...s, name: "Régi" }, devices)).toThrow("közben módosították");
  });
});
