import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card } from "@/components/Shell";
import { getAppliances, hcStartLink, hcFinishLink, hcStop } from "@/lib/nas.functions";

export const appliancesQuery = queryOptions({ queryKey: ["hc"], queryFn: () => getAppliances(), refetchInterval: 60000 });
const STATE: Record<string, string> = { Inactive: "kikapcsolva", Ready: "készenlét", DelayedStart: "késleltetett indítás", Run: "fut", Pause: "szünetel", ActionRequired: "beavatkozás kell", Finished: "kész", Error: "hiba", Aborting: "leáll" };
const TYPE: Record<string, string> = { Washer: "Mosógép", Dryer: "Szárító", WasherDryer: "Mosó-szárító", Dishwasher: "Mosogatógép", Oven: "Sütő", FridgeFreezer: "Hűtő", Refrigerator: "Hűtő", Freezer: "Fagyasztó", CoffeeMaker: "Kávéfőző", Hob: "Főzőlap", Hood: "Páraelszívó" };

export function Appliances() {
  const { data } = useSuspenseQuery(appliancesQuery);
  const qc = useQueryClient();
  const [link, setLink] = useState<{ code: string; url: string } | null>(null);
  const [msg, setMsg] = useState("");
  const start = async () => { setMsg(""); const r = await hcStartLink(); if (r.ok) { setLink({ code: r.code, url: r.url }); window.open(r.url, "_blank"); } else setMsg(r.error); };
  const finish = async () => { const r = await hcFinishLink(); if (r.ok) { setLink(null); qc.invalidateQueries({ queryKey: ["hc"] }); } else setMsg(r.error); };
  return (
    <Card title="Bosch háztartási gépek" className="mt-4">
      {!data.linked ? (
        <div className="space-y-3 text-sm">
          {!link ? <button onClick={start} className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground">Összekötés a Home Connecttel</button> : <>
            <p>Jelentkezz be a megnyílt Home Connect oldalon, és hagyd jóvá. Kód: <span className="font-mono font-bold">{link.code}</span></p>
            <a href={link.url} target="_blank" rel="noreferrer" className="block text-primary underline">Oldal megnyitása újra</a>
            <button onClick={finish} className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground">Jóváhagytam</button></>}
          {msg && <p className="font-mono text-destructive">● {msg}</p>}
        </div>
      ) : data.error ? <p className="font-mono text-sm text-destructive">● {data.error}</p> : data.appliances.length === 0 ? <p className="text-sm text-muted-foreground">Nincs gép a fiókban.</p> : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {data.appliances.map((a) => (
            <div key={a.haId} className="rounded-lg bg-secondary p-3">
              <div className="flex justify-between gap-2"><span className="font-medium">{a.name || TYPE[a.type] || a.type}</span>
                <span className="font-mono text-xs text-muted-foreground">{a.connected ? STATE[a.state] || a.state || "elérhető" : "○ offline"}</span></div>
              {a.program && <div className="mt-1 text-sm">{a.program}{a.remaining != null && ` · még ${Math.round(a.remaining / 60)} perc`}</div>}
              {a.progress != null && <div className="mt-2 h-1.5 rounded bg-background"><div className="h-full rounded bg-primary" style={{ width: `${a.progress}%` }} /></div>}
              {a.door && <div className="mt-1 text-xs text-muted-foreground">Ajtó: {a.door === "Open" ? "nyitva" : a.door === "Closed" ? "zárva" : a.door === "Locked" ? "reteszelve" : a.door}</div>}
              {a.state === "Run" && <button onClick={async () => { await hcStop({ data: { haId: a.haId } }); qc.invalidateQueries({ queryKey: ["hc"] }); }} className="mt-2 rounded border border-border px-3 py-1 text-xs">Program leállítása</button>}
            </div>))}
        </div>)}
    </Card>
  );
}
