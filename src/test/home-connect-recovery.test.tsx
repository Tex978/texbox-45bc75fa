import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Appliances } from "@/components/Appliances";

vi.mock("@/lib/nas.functions", () => ({
  getAppliances: vi.fn(),
  hcStartLink: vi.fn(async () => ({ ok: true, code: "TEST-CODE", url: "https://api.home-connect.com/security/oauth/verify" })),
  hcFinishLink: vi.fn(), hcStop: vi.fn(), hcPrograms: vi.fn(), hcControl: vi.fn(),
}));

describe("Home Connect error recovery", () => {
  it("opens the authorization flow while the previous connection is still marked linked", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
    client.setQueryData(["hc"], { linked: true, appliances: [], error: "Expired [HC/401]" });
    render(<QueryClientProvider client={client}><Appliances /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Újraösszekötés" }));
    expect(await screen.findByRole("button", { name: "Jóváhagytam" })).toBeVisible();
    expect(screen.getByRole("link", { name: /Bosch belépés/ })).toHaveAttribute("target", "_blank");
    client.clear();
  });
});