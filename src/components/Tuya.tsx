import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { SmartSection as Card } from "@/components/SmartHomeUI";
import { Button } from "@/components/ui/button";
import { ArrowUp, ArrowDown, Square, Settings2, Check, X, ChevronDown, ChevronRight, Power, Play, Lightbulb, WashingMachine, Droplets, Battery, Minus, Plus, LogOut, QrCode } from "lucide-react";
import { getTuya, tuyaCommand, tuyaQrStart, tuyaQrFinish, tuyaLogout } from "@/lib/nas.functions";

export const tuyaQuery = queryOptions({ queryKey: ["tuya"], queryFn: () => getTuya(), refetchInterval: 60000 });
const CAT: Record<string, string> = { dj: "Lámpa", dd: "LED szalag", kg: "Kapcsoló", cz: "Konnektor", pc: "Elosztó", qn: "Fűtőtest", wk: "Termosztát", wsdcg: "Hőmérő", mcs: "Ajtóérzékelő", pir: "Mozgásérzékelő", ywbj: "Füstérzékelő", sj: "Vízérzékelő", rqbj: "Gázérzékelő" };
type St = { code: string; value: string | number | boolean };
const val = (s: St[], ...c: string[]) => s.find((x) => c.includes(x.code))?.value;
const temp = (v: unknown) => typeof v === "number" ? (Math.abs(v) > 100 ? v / 10 : v) : null;
const KEY = "tuya-meta";
type Meta = Record<string, { name?: string; room?: string; hidden?: boolean }>;

function Dev({ d, name }: { d: { id: string; category: string; online: boolean; status: St[] }; name: string }) {
  const qc = useQueryClient();
  const [msg, setMsg] = useState("");
  const sw = d.status.find((x) => /^switch(_led|_1)?$/.test(x.code) && typeof x.value === "boolean");
  const send = async (code: string, value: boolean | number | string) => {
    setMsg("…"); const r = await tuyaCommand({ data: { id: d.id, code, value } }); setMsg(r.ok ? "" : `● ${r.error}`);
    setTimeout(() => qc.invalidateQueries({ queryKey: ["tuya"] }), 1500);
  };
  const t = temp(val(d.status, "va_temperature", "temp_current", "cur_temp"));
  const set = val(d.status, "temp_set");
  const hum = val(d.status, "va_humidity", "humidity_value");
  const bat = val(d.status, "battery_percentage", "va_battery");
  const door = val(d.status, "doorcontact_state");
  const pir = val(d.status, "pir");
  const bright = d.status.find((x) => x.code === "bright_value_v2" || x.code === "bright_value");
  return (
    <div className="smart-device">
      <div className="flex items-start justify-between gap-2">
        <div><div className="flex items-center gap-2 font-medium"><Lightbulb size={19} className="shrink-0 text-home-energy" />{name}</div><div className="text-xs text-muted-foreground">{CAT[d.category] || d.category}{!d.online && " · ○ offline"}</div></div>
        {sw && <Button variant="outline" onClick={() => send(sw.code, !sw.value)} disabled={!d.online}
          size="icon" aria-label={`${name} ${sw.value ? "kikapcsolás" : "bekapcsolás"}`} title={sw.value ? "Kikapcsolás" : "Bekapcsolás"}
          className={sw.value ? "bg-primary text-primary-foreground" : "border border-border"}><Power /></Button>}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-sm">
        {t != null && <span>{t}°</span>}
        {hum != null && <span className="inline-flex items-center gap-1"><Droplets size={14} />{String(hum)}%</span>}
        {door != null && <span>{door ? "nyitva" : "zárva"}</span>}
        {pir != null && <span>{pir === "pir" ? "mozgás!" : "nincs mozgás"}</span>}
        {bat != null && <span className="inline-flex items-center gap-1 text-muted-foreground"><Battery size={15} />{String(bat)}%</span>}
      </div>
      {typeof set === "number" && <div className="mt-2 flex items-center gap-2 text-sm">
        <Button variant="outline" onClick={() => send("temp_set", set - 1)} className="rounded border border-border px-2"><Minus /></Button>
        <span className="font-mono">cél: {set}°</span>
        <Button variant="outline" onClick={() => send("temp_set", set + 1)} className="rounded border border-border px-2"><Plus /></Button></div>}
      {bright && typeof bright.value === "number" && <input type="range" min={bright.code.endsWith("v2") ? 10 : 25} max={bright.code.endsWith("v2") ? 1000 : 255} defaultValue={bright.value}
        onMouseUp={(e) => send(bright.code, Number(e.currentTarget.value))} onTouchEnd={(e) => send(bright.code, Number(e.currentTarget.value))} className="mt-2 w-full" />}
      {msg && <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}

function TuyaLink() {
  const qc = useQueryClient();
  const [uc, setUc] = useState("");
  const [qr, setQr] = useState("");
  const [msg, setMsg] = useState("");
  const start = async () => { setMsg(""); const r = await tuyaQrStart({ data: { userCode: uc } }); if (r.ok) setQr(r.qr); else setMsg(r.error); };
  const finish = async () => { setMsg("…"); const r = await tuyaQrFinish(); if (r.ok) qc.invalidateQueries({ queryKey: ["tuya"] }); else setMsg(r.error); };
  return (
    <Card title="Tuya / Smart Life eszközök" className="mt-4">
      {!qr ? <div className="space-y-2 text-sm">
        <p className="text-muted-foreground">Smart Life app → Én → ⚙ Beállítások → Fiók és biztonság → <b>User Code</b>. Másold ide:</p>
        <div className="flex gap-2"><input value={uc} onChange={(e) => setUc(e.target.value)} placeholder="User Code" className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 font-mono" />
          <Button variant="outline" disabled={!uc.trim()} onClick={start} className="rounded-md bg-primary px-4 py-1 font-medium text-primary-foreground"><QrCode />QR-kód kérése</Button></div>
      </div> : <div className="space-y-3 text-sm">
        <p>Smart Life app → jobb felső sarok <b>⊕ / beolvasás</b> ikon → olvasd be, majd a telefonon nyomd meg a <b>Megerősítés</b> gombot.</p>
        <img src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=${encodeURIComponent(qr)}`} alt="Tuya QR-kód" width={220} height={220} className="rounded bg-foreground" />
        <div className="flex gap-2"><Button variant="outline" onClick={finish} className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground">Beolvastam és jóváhagytam</Button>
          <Button variant="outline" onClick={() => setQr("")} className="rounded-md border border-border px-4 py-2">Új kód</Button></div>
      </div>}
      {msg && <p className="mt-2 break-all font-mono text-xs text-destructive">{msg === "…" ? "" : "● "}{msg}</p>}
    </Card>
  );
}

export function Tuya() {
  const { data } = useSuspenseQuery(tuyaQuery);
  const qc = useQueryClient();
  const [meta, setMeta] = useState<Meta>({});
  const [edit, setEdit] = useState(false);
  useEffect(() => { try { setMeta(JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { /* */ } }, []);
  const upd = (id: string, v: Meta[string]) => setMeta((m) => { const n = { ...m, [id]: { ...m[id], ...v } }; localStorage.setItem(KEY, JSON.stringify(n)); return n; });
  if (!data.configured) return <TuyaLink />;
  const shown = data.devices.filter((d) => !meta[d.id]?.hidden);
  const rooms = [...new Set(shown.map((d) => meta[d.id]?.room || "Egyéb"))].sort((a, b) => a === "Egyéb" ? 1 : b === "Egyéb" ? -1 : a.localeCompare(b, "hu"));
  return (
    <Card title="Tuya eszközök" className="mt-4">
      {data.error ? <p className="break-all font-mono text-sm text-destructive">● {data.error}</p> : <>
        <div className="mb-3 flex justify-end gap-2"><Button variant="outline" onClick={async () => { await tuyaLogout(); qc.invalidateQueries({ queryKey: ["tuya"] }); }} className="rounded border border-border px-3 py-1 text-xs"><LogOut />Kijelentkezés</Button><Button variant="outline" onClick={() => setEdit(!edit)} className="rounded border border-border px-3 py-1 text-xs">{edit ? <Check /> : <Settings2 />}{edit ? "Kész" : "Eszközkezelő"}</Button></div>
        {edit ? <div className="space-y-2">{data.devices.map((d) => (
          <div key={d.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-secondary p-2 text-sm">
            <input value={meta[d.id]?.name ?? ""} placeholder={d.name} onChange={(e) => upd(d.id, { name: e.target.value })} className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1" />
            <input value={meta[d.id]?.room ?? ""} placeholder="Szoba" list="tuya-rooms" onChange={(e) => upd(d.id, { room: e.target.value })} className="w-32 rounded border border-border bg-background px-2 py-1" />
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={!!meta[d.id]?.hidden} onChange={(e) => upd(d.id, { hidden: e.target.checked })} /> Elrejtés</label>
          </div>))}
          <datalist id="tuya-rooms">{[...new Set(Object.values(meta).map((m) => m.room).filter(Boolean))].map((r) => <option key={r} value={r} />)}</datalist>
        </div> : data.devices.length === 0 ? <p className="text-sm text-muted-foreground">Nincs eszköz – ellenőrizd, hogy a Smart Life fiók össze van-e kötve a Tuya projekttel.</p> :
          rooms.map((r) => (<div key={r} className="mb-4"><h3 className="mb-2 text-sm font-medium text-muted-foreground">{r}</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{shown.filter((d) => (meta[d.id]?.room || "Egyéb") === r).map((d) => <Dev key={d.id} d={d} name={meta[d.id]?.name || d.name} />)}</div></div>))}
        <details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer">Nyers adatok (hibakereséshez)</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono">{JSON.stringify(data.devices, null, 1)}</pre></details>
      </>}
    </Card>
  );
}
