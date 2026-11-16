import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const mocks = vi.hoisted(() => ({ save: vi.fn(async (d: unknown) => d) }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/scenes.functions", () => ({
  scenesList: async () => ({
    scenes: [],
    userId: "parent",
    canEdit: true,
    admin: false,
    users: [],
  }),
  scenesDevices: async () => ({
    devices: [
      {
        key: "gree:192.168.1.2",
        name: "Tesztklíma",
        online: true,
        actions: ["power", "temperature"],
      },
    ],
    errors: [],
  }),
  scenesSave: mocks.save,
  scenesDelete: vi.fn(),
  scenesRun: vi.fn(),
  scenesRuns: async () => [],
  scenesAcl: vi.fn(),
}));
import { Scenes } from "@/components/Scenes";
afterEach(() => cleanup());
describe("scene editor", () => {
  it("saves a user-created scene with the selected actual command parameters", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <Scenes />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Új jelenet" }));
    fireEvent.change(screen.getByLabelText("Név"), { target: { value: "Saját este" } });
    fireEvent.click(await screen.findByRole("button", { name: "Művelet hozzáadása" }));
    fireEvent.change(screen.getByLabelText("Eszköz"), { target: { value: "gree:192.168.1.2" } });
    fireEvent.change(screen.getByLabelText("Művelet"), { target: { value: "temperature" } });
    fireEvent.change(screen.getByLabelText("Célhőmérséklet (°C)"), { target: { value: "23" } });
    fireEvent.click(screen.getByRole("button", { name: "Jelenet mentése" }));
    await vi.waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: "Saját este",
          steps: [{ device: "gree:192.168.1.2", action: "temperature", value: 23 }],
        }),
      }),
    );
  });
});
