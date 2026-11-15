type Properties = Record<string, string | number>;
type Client = { on: (event: string, callback: (...args: any[]) => void) => void; disconnect: () => Promise<void>; setProperties: (properties: Properties) => Promise<void> };
export async function withGree(ip: string, command?: Properties): Promise<Properties> {
  // The local UDP library is loaded only on the self-hosted Node runtime.
  let library: any;
  try { library = await import(/* @vite-ignore */ "gree-" + "hvac-client"); }
  catch { throw new Error("A Gree klímák a Synologyn futó változatból érhetők el."); }
  const ClientConstructor = (library.default ?? library).Client;
  return new Promise((resolve, reject) => {
    let finished = false;
    const client: Client = new ClientConstructor({ host: ip, autoConnect: true, poll: false, connectTimeout: 2500, pollingTimeout: 2500, logLevel: "error" });
    const finish = (error?: Error, properties?: Properties) => {
      if (finished) return;
      finished = true; clearTimeout(timer);
      void client.disconnect().catch(() => {});
      if (error) reject(error); else resolve(properties ?? {});
    };
    const timer = setTimeout(() => finish(new Error("A klíma nem válaszolt. Ellenőrizd az IP-címet és az otthoni hálózatot.")), 7000);
    client.on("error", () => finish(new Error("Nem sikerült kapcsolódni a Gree klímához.")));
    client.on("no_response", () => finish(new Error("A klíma nem válaszolt.")));
    client.on("update", (_updated, properties: Properties) => { if (!command) finish(undefined, properties); });
    client.on("connect", () => { if (command) void client.setProperties(command).then(() => finish(undefined, command)).catch(() => finish(new Error("A klíma nem fogadta el a parancsot."))); });
  });
}