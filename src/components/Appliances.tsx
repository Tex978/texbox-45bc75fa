import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { SmartSection as Card } from "@/components/SmartHomeUI";
import { Button } from "@/components/ui/button";
import { ArrowUp, ArrowDown, Square, Settings2, Check, X, ChevronDown, ChevronRight, Power, Play, Lightbulb, WashingMachine, Droplets, Battery, Minus, Plus, LogOut, QrCode } from "lucide-react";
import { getAppliances, hcStartLink, hcFinishLink, hcStop, hcPrograms, hcControl, type Appliance } from "@/lib/nas.functions";

export const appliancesQuery = queryOptions({ queryKey: ["hc"], queryFn: () => getAppliances(), refetchInterval: 60000 });
const STATE: Record<string, string> = { Inactive: "kikapcsolva", Ready: "készenlét", DelayedStart: "késleltetett indítás", Run: "fut", Pause: "szünetel", ActionRequired: "beavatkozás kell", Finished: "kész", Error: "hiba", Aborting: "leáll" };
const TYPE: Record<string, string> = { Washer: "Mosógép", Dryer: "Szárító", WasherDryer: "Mosó-szárító", Dishwasher: "Mosogatógép", Oven: "Sütő", FridgeFreezer: "Hűtő", Refrigerator: "Hűtő", Freezer: "Fagyasztó", CoffeeMaker: "Kávéfőző", Hob: "Főzőlap", Hood: "Páraelszívó" };
type Meta = Record<string, { name?: string; hidden?: boolean }>;
const KEY = "hc-meta";

function Device({ a, label }: { a: Appliance; label: string }) {
  const qc = useQueryClient();
  const [progs, setProgs] = useState<{ key: string; name: string }[] | null>(null);
  const [sel, setSel] = useState("");
  const [msg, setMsg] = useState("");
  const refresh = () => setTimeout(() => qc.invalidateQueries({ queryKey: ["hc"] }), 1500);
  const run = async (p: Promise<{ ok: boolean; error?: string }>) => { setMsg("…"); const r = await p; setMsg(r.ok ? "✓ elküldve" : `● ${r.error}`); refresh(); };
  const loadProgs = async () => { const r = await hcPrograms({ data: { haId: a.haId } }); setProgs(r.programs); setSel(r.programs[0]?.key || ""); if (r.error) setMsg(`● ${r.error}`); };
  const on = a.connected && a.state !== "Inactive";
  return (
    <div className="smart-device">
      <div className="flex justify-between gap-2"><span className="inline-flex min-w-0 items-center gap-2 font-medium"><WashingMachine size={19} className="shrink-0 text-home-water" />{label}</span>
        <span className="font-mono text-xs text-muted-foreground">{a.connected ? STATE[a.state] || a.state || "elérhető" : "○ offline"}</span></div>
      {a.program && <div className="mt-1 text-sm">{a.program}{a.remaining != null && ` · még ${Math.round(a.remaining / 60)} perc`}</div>}
      {a.progress != null && <div className="mt-2 h-1.5 rounded bg-background"><div className="h-full rounded bg-primary" style={{ width: `${a.progress}%` }} /></div>}
      {a.door && <div className="mt-1 text-xs text-muted-foreground">Ajtó: {a.door === "Open" ? "nyitva" : a.door === "Closed" ? "zárva" : a.door === "Locked" ? "reteszelve" : a.door}</div>}
      {a.connected && <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => run(hcControl({ data: { haId: a.haId, action: "power", on: !on, type: a.type } }))} className="rounded border border-border px-3 py-1 text-xs"><Power />{on ? "Kikapcsolás" : "Bekapcsolás"}</Button>
        {a.state === "Run" || a.state === "DelayedStart" || a.state === "Pause"
          ? <Button variant="outline" onClick={() => run(hcStop({ data: { haId: a.haId } }).then((r) => ({ ...r, error: "nem sikerült" })))} className="rounded border border-border px-3 py-1 text-xs"><Square />Program leállítása</Button>
          : progs === null ? <Button variant="outline" onClick={loadProgs} className="rounded border border-border px-3 py-1 text-xs"><Play />Program indítása…</Button> : null}
      </div>}
      {progs && a.state !== "Run" && <div className="mt-2 flex gap-2">
        <select value={sel} onChange={(e) => setSel(e.target.value)} className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-xs">
          {progs.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}</select>
        <Button variant="outline" disabled={!sel} onClick={() => run(hcControl({ data: { haId: a.haId, action: "start", program: sel } }))} className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground"><Play />Indítás</Button></div>}
      {progs && !a.remoteStart && <p className="mt-1 text-xs text-muted-foreground">Indításhoz a gépen be kell kapcsolni a „Távoli indítás” funkciót.</p>}
      {msg && <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}

export function Appliances() {
  const { data } = useSuspenseQuery(appliancesQuery);
  const qc = useQueryClient();
  const [link, setLink] = useState<{ code: string; url: string } | null>(null);
  const [msg, setMsg] = useState("");
  const [meta, setMeta] = useState<Meta>({});
  const [edit, setEdit] = useState(false);
  useEffect(() => { try { setMeta(JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { /* */ } }, []);
  const upd = (id: string, v: { name?: string; hidden?: boolean }) => setMeta((m) => { const n = { ...m, [id]: { ...m[id], ...v } }; localStorage.setItem(KEY, JSON.stringify(n)); return n; });
  const start = async () => { setMsg(""); const r = await hcStartLink(); if (r.ok) setLink({ code: r.code, url: r.url }); else setMsg(r.error); };
  const finish = async () => { const r = await hcFinishLink(); if (r.ok) { setLink(null); qc.invalidateQueries({ queryKey: ["hc"] }); } else setMsg(r.error); };
  const label = (a: Appliance) => meta[a.haId]?.name || a.name || TYPE[a.type] || a.type;
  const shown = data.appliances.filter((a) => !meta[a.haId]?.hidden);
  return (
    <Card title="Bosch háztartási gépek" className="mt-4">
      {!data.linked || link ? (
        <div className="space-y-3 text-sm">
          {!link ? <Button variant="outline" onClick={start} className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground">Összekötés a Home Connecttel</Button> : <>
            <p>Nyisd meg a Bosch oldalát, lépj be, és hagyd jóvá. Kód: <span className="font-mono font-bold">{link.code}</span></p>
            <a href={link.url} target="_blank" rel="noopener noreferrer" className="inline-block rounded-md border border-border px-4 py-2">Bosch belépés megnyitása új lapon ↗</a>
            <p className="text-xs text-muted-foreground">Ha nem nyílik meg, másold be a böngészőbe:</p>
            <input readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-xs" />
            <Button variant="outline" onClick={finish} className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground">Jóváhagytam</Button></>}
          {msg && <p className="font-mono text-destructive">● {msg}</p>}
        </div>
      ) : data.error ? <div className="space-y-3">
        <p role="alert" className="text-sm text-destructive">{data.error}</p>
        <Button variant="outline" onClick={start}><LogOut />Újraösszekötés</Button>
        {msg && <p role="alert" className="text-sm text-destructive">{msg}</p>}
      </div> : <>
        <div className="mb-3 flex justify-end"><Button variant="outline" onClick={() => setEdit(!edit)} className="rounded border border-border px-3 py-1 text-xs">{edit ? <Check /> : <Settings2 />}{edit ? "Kész" : "Eszközkezelő"}</Button></div>
        {edit ? <div className="space-y-2">
          {data.appliances.map((a) => (
            <div key={a.haId} className="flex flex-wrap items-center gap-2 rounded-lg bg-secondary p-2 text-sm">
              <input value={meta[a.haId]?.name ?? ""} placeholder={a.name || TYPE[a.type] || a.type} onChange={(e) => upd(a.haId, { name: e.target.value })} className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1" />
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={!!meta[a.haId]?.hidden} onChange={(e) => upd(a.haId, { hidden: e.target.checked })} /> Elrejtés</label>
            </div>))}
        </div> : shown.length === 0 ? <p className="text-sm text-muted-foreground">Nincs megjeleníthető gép.</p> : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{shown.map((a) => <Device key={a.haId} a={a} label={label(a)} />)}</div>)}
      </>}
    </Card>
  );
}
