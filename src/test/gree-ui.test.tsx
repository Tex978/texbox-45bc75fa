import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Gree, GreeQuickControls } from "@/components/Gree";
import { greeControl, getGree } from "@/lib/nas.functions";
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/lib/nas.functions", () => ({ getGree: vi.fn(), greeControl: vi.fn() }));
vi.mock("@/lib/prefs.functions", () => ({
  getSharedPrefs: vi.fn(async () => ({ prefs: {}, shared: true })),
  saveSharedPref: vi.fn(async ({ data }: { data: { key: string; value: unknown } }) => ({ prefs: { [data.key]: data.value } })),
}));
import { saveSharedPref } from "@/lib/prefs.functions";
const units = [
  {
    ip: "192.168.1.60",
    name: "Klíma A",
    online: true,
    error: "",
    properties: { power: "on", temperature: 24, mode: "cool", fanSpeed: "auto" },
  },
  {
    ip: "192.168.1.61",
    name: "Klíma B",
    online: true,
    error: "",
    properties: { power: "off", temperature: 22, mode: "heat", fanSpeed: "low" },
  },
] as const;
function mount(children: React.ReactNode) {
  vi.mocked(getGree).mockResolvedValue({ configured: true, units: [...units], error: "" });
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  client.setQueryData(["gree"], { configured: true, units });
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});
describe("climate selection and commands", () => {
  it("opens only the tapped unit's full controls and switches with one tap", () => {
    mount(<Gree selectedIp={units[1].ip} />);
    expect(screen.getByRole("combobox", { name: "Klíma B üzemmód" })).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "Klíma A üzemmód" })).toBeNull();
    cleanup();
    mount(<Gree />);
    fireEvent.click(screen.getByRole("button", { name: "Klíma B kiválasztása" }));
    expect(screen.getByRole("combobox", { name: "Klíma B ventilátor" })).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "Klíma A ventilátor" })).toBeNull();
  });
  it("blocks concurrent commands to the same unit across controls", async () => {
    let finish: (() => void) | undefined;
    vi.mocked(greeControl).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ ok: true });
        }),
    );
    mount(
      <>
        <Gree />
        <GreeQuickControls unit={units[0]} />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Klíma A panel kikapcsolás" }));
    for (const button of screen.getAllByRole("button", { name: "Klíma A kikapcsolás" })) {
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    expect(greeControl).toHaveBeenCalledTimes(1);
    expect(greeControl).toHaveBeenCalledWith({
      data: { ip: "192.168.1.60", property: "power", value: "off" },
    });
    finish?.();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Klíma A panel kikapcsolás" })).toBeEnabled(),
    );
  });
  it("saves a custom room for the selected climate to the shared NAS store", async () => {
    mount(<Gree />);
    fireEvent.change(screen.getByRole("textbox", { name: "Új szoba neve" }), {
      target: { value: "Nappali" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Szoba hozzáadása" }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Klíma A szobája" })).toHaveTextContent("Nappali"));
    fireEvent.change(screen.getByRole("combobox", { name: "Klíma A szobája" }), {
      target: { value: "Nappali" },
    });
    await waitFor(() => expect(vi.mocked(saveSharedPref)).toHaveBeenCalled());
    expect((vi.mocked(saveSharedPref).mock.calls.at(-1)![0] as any).data.value.assignments).toEqual({
      "192.168.1.60": "Nappali",
    });
  });
});
