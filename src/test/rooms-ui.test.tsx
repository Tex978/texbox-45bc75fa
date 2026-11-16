import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createUser, createSession, resetAuthDb } from "@/lib/auth.server";
import { type RoomAction } from "@/lib/rooms";
let token = "",
  dir = "";
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/rooms.functions", () => ({
  roomsGet: async () => {
    const s = await import("@/lib/rooms.server");
    return s.readRooms(token);
  },
  roomsChange: async ({ data }: { data: { version: number; action: RoomAction } }) => {
    const s = await import("@/lib/rooms.server");
    return s.writeRooms(token, data.version, data.action);
  },
}));
import { RoomsManager } from "@/components/RoomsManager";
afterEach(() => {
  cleanup();
  resetAuthDb();
  vi.resetModules();
  delete process.env["DATA_DIR"];
  delete process.env["DATA_FILE"];
  if (dir) rmSync(dir, { recursive: true, force: true });
});
it("moves real Xiaomi sensor and purifier through UI into persistent NAS room metadata", async () => {
  dir = mkdtempSync(join(tmpdir(), "room-ui-"));
  process.env["DATA_DIR"] = dir;
  process.env["DATA_FILE"] = `${dir}/nas-state.json`;
  resetAuthDb();
  const u = createUser({
    username: "apa",
    displayName: "Apa",
    role: "admin",
    password: "jelszo123",
  });
  token = createSession(u.id, "Android");
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <RoomsManager
        editable
        selected="all"
        onClose={() => {}}
        devices={[
          {
            key: "sensors:s",
            category: "sensors",
            name: "Xiaomi hőmérő",
            room: "Régi",
            online: true,
            active: false,
            state: "21°",
          },
          {
            key: "air:a",
            category: "air",
            name: "Xiaomi légtisztító",
            room: "",
            online: true,
            active: false,
            state: "Kikapcsolva",
          },
        ]}
      />
    </QueryClientProvider>,
  );
  const input = await screen.findByLabelText("Új szoba neve");
  await waitFor(() => expect(input).not.toBeDisabled());
  fireEvent.change(input, { target: { value: "Nappali" } });
  fireEvent.click(screen.getByRole("button", { name: "Szoba felvétele" }));
  await screen.findByText("Szobabeállítás mentve.");
  await waitFor(() => expect(screen.getByLabelText("Xiaomi hőmérő szobája")).not.toBeDisabled());
  const sensor = screen.getByLabelText("Xiaomi hőmérő szobája");
  fireEvent.change(sensor, { target: { value: "Nappali" } });
  await screen.findByText("Szobabeállítás mentve.");
  await waitFor(() => expect(screen.getByLabelText("Xiaomi légtisztító szobája")).not.toBeDisabled());
  fireEvent.change(screen.getByLabelText("Xiaomi légtisztító szobája"), {
    target: { value: "Nappali" },
  });
  await screen.findByText("Szobabeállítás mentve.");
  const server = await import("@/lib/rooms.server");
  expect(server.readRooms(token).assignments).toEqual({
    "sensors:s": "Nappali",
    "air:a": "Nappali",
  });
  qc.clear();
});
