import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ cookie: vi.fn(), readStoredCookie: vi.fn() }));
vi.mock("@tanstack/react-start/server", () => ({ getCookie: mocks.cookie }));
vi.mock("@/lib/shared-store.server", () => ({ readStoredCookie: mocks.readStoredCookie }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
}));
import { Route } from "@/routes/api/plex-thumb";

const handler = (Route as unknown as {
  server: { handlers: { GET: (ctx: { request: Request }) => Promise<Response> } };
}).server.handlers.GET;
const request = () => new Request("http://localhost/api/plex-thumb?path=%2Flibrary%2Fmetadata%2F42%2Fthumb%2F123");

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetAllMocks(); });

describe("Plex poster proxy", () => {
  it("loads shared connection settings even when this browser has no configuration cookie", async () => {
    mocks.cookie.mockReturnValue(undefined);
    mocks.readStoredCookie.mockReturnValue(JSON.stringify({ PLEX_URL: "192.168.1.8:32400/", PLEX_TOKEN: "test-token" }));
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await handler({ request: request() });
    expect(mocks.readStoredCookie).toHaveBeenCalledWith("nas-cfg", mocks.cookie);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://192.168.1.8:32400/photo/:/transcode?width=300&height=450&minSize=1&url=%2Flibrary%2Fmetadata%2F42%2Fthumb%2F123",
      expect.objectContaining({ headers: { "X-Plex-Token": "test-token" } }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3]);
  });

  it("retains environment configuration when no shared or legacy settings exist", async () => {
    mocks.readStoredCookie.mockReturnValue(undefined);
    vi.stubEnv("PLEX_URL", "https://plex.example.test");
    vi.stubEnv("PLEX_TOKEN", "env-test-token");
    const fetchMock = vi.fn(async () => new Response("image", { headers: { "content-type": "image/jpeg" } }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await handler({ request: request() })).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("https://plex.example.test/photo/"), expect.objectContaining({ headers: { "X-Plex-Token": "env-test-token" } }));
  });

  it("rejects image paths outside the Plex library without contacting Plex", async () => {
    mocks.readStoredCookie.mockReturnValue(JSON.stringify({ PLEX_URL: "http://plex.example.test" }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await handler({ request: new Request("http://localhost/api/plex-thumb?path=https://other.example.test/image") });
    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});