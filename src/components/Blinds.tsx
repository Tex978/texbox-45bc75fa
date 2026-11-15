import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card } from "@/components/Shell";
import { getBlinds, blindAction, blindGroupAction, saveBlindMeta } from "@/lib/nas.functions";

export const blindsQuery = queryOptions({ queryKey: ["blinds"], queryFn: () => getBlinds(), refetchInterval: 15000 });
type Blind = Awaited<ReturnType<typeof getBlinds>>["blinds"][number];
const posLabel = (p: number) => (p < 0 ? "?" : p === 0 ? "Nyitva" : p === 100 ? "Zárva" : `${100 - p}%`);
const btn = "rounded-md border border-border px-2.5 py-1 text-sm hover:bg-secondary";

export function Blinds() {
  const { data } = useSuspenseQuery(blindsQuery);
  const qc = useQueryClient();
  const [err, setErr] = useState("");
  const [setup, setSetup] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [excl, setExcl] = useState<string[]>([]);
  useEffect(() => { try { setExcl(JSON.parse(localStorage.getItem("blinds-excluded") || "[]")); } catch { /* ignore */ } }, []);
  const inc = (l: Blind[]) => l.filter((b) => !excl.includes(b.mac));
  const optimistic = (macs: string[], pos: number) =>
    qc.setQueryData(blindsQuery.queryKey, { ...data, blinds: data.blinds.map((x) => (macs.includes(x.mac) ? { ...x, position: pos } : x)) });
  const refresh = () => setTimeout(() => qc.invalidateQueries({ queryKey: blindsQuery.queryKey }), 3000);

  const act = async (b: Blind, action: "open" | "close" | "position", position?: number) => {
    setErr("");
    const pos = action === "open" ? 0 : action === "close" ? 100 : position;
    if (pos != null) optimistic([b.mac], pos);
    if (data.demo) return;
    try { await blindAction({ data: { mac: b.mac, deviceType: b.deviceType, action, ...(position != null ? { position } : {}) } }); refresh(); }
    catch (e) { setErr(String((e as Error).message || e)); }
  };
  const group = async (list: Blind[], action: "open" | "close" | "stop") => {
    setErr("");
    if (action !== "stop") optimistic(list.map((b) => b.mac), action === "open" ? 0 : 100);
    if (data.demo) return;
    try {
      const r = await blindGroupAction({ data: { blinds: list.map((b) => ({ mac: b.mac, deviceType: b.deviceType })), action } });
      if (r.failed) setErr(`${r.failed} redőny nem válaszolt`);
      refresh();
    } catch (e) { setErr(String((e as Error).message || e)); }
  };

  const rooms = new Map<string, Blind[]>();
  for (const b of data.blinds) { const r = b.room || "Egyéb"; rooms.set(r, [...(rooms.get(r) ?? []), b]); }
  const sorted = [...rooms.entries()].sort(([a], [b]) => (a === "Egyéb" ? 1 : b === "Egyéb" ? -1 : a.localeCompare(b, "hu")));

  return (
    <Card title="Redőnyök" className="mt-4">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Összes ({data.blinds.length})</span>
        <button className={btn} onClick={() => group(inc(data.blinds), "open")}>▲ Mind fel</button>
        <button className={btn} onClick={() => group(inc(data.blinds), "stop")} aria-label="Mind állj">■</button>
        <button className={btn} onClick={() => group(inc(data.blinds), "close")}>▼ Mind le</button>
        <button className={`${btn} ml-auto`} onClick={() => setSetup(true)} aria-label="Redőnyök beállítása" title="Nevek és szobák">⚙</button>
      </div>
      {data.error ? <p className="font-mono text-sm text-destructive">● {data.error}</p> : (
        <div className="grid items-start gap-3 sm:grid-cols-2">
          {sorted.map(([room, list]) => {
            const avg = Math.round(list.reduce((s, b) => s + Math.max(0, b.position), 0) / list.length);
            const isOpen = open[room] ?? false;
            return (
              <div key={room} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <button className="min-w-0 flex-1 text-left" onClick={() => setOpen({ ...open, [room]: !isOpen })}>
                    <div className="truncate font-medium">{isOpen ? "▾" : "▸"} {room}</div>
                    <div className="text-xs text-muted-foreground">{list.length} redőny · {posLabel(avg)}</div>
                  </button>
                  <button className={btn} onClick={() => group(inc(list), "open")} aria-label={`${room} fel`}>▲</button>
                  <button className={btn} onClick={() => group(inc(list), "stop")} aria-label={`${room} állj`}>■</button>
                  <button className={btn} onClick={() => group(inc(list), "close")} aria-label={`${room} le`}>▼</button>
                </div>
                {isOpen && (
                  <div className="mt-3 space-y-3 border-t border-border pt-3">
                    {list.map((b) => (
                      <div key={b.mac} className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex justify-between text-sm"><span className="truncate">{b.name}</span><span className="font-mono text-xs text-muted-foreground">{posLabel(b.position)}</span></div>
                          <input type="range" min={0} max={100} defaultValue={100 - Math.max(0, b.position)} key={b.position} aria-label={`${b.name} nyitottság`}
                            onPointerUp={(e) => act(b, "position", 100 - Number((e.target as HTMLInputElement).value))} className="w-full accent-current text-primary" />
                        </div>
                        <button className={btn} onClick={() => act(b, "open")} aria-label={`${b.name} fel`}>▲</button>
                        <button className={btn} onClick={() => act(b, "close")} aria-label={`${b.name} le`}>▼</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {data.blinds.length === 0 && <p className="text-sm text-muted-foreground">Nem található redőny a hubon.</p>}
        </div>
      )}
      {err && <p className="mt-3 font-mono text-xs text-destructive">● {err}</p>}
      {setup && <BlindSetup excluded={excl} setExcluded={(v) => { setExcl(v); localStorage.setItem("blinds-excluded", JSON.stringify(v)); }} blinds={data.blinds} demo={data.demo} onClose={() => setSetup(false)} />}
    </Card>
  );
}

function BlindSetup({ blinds, demo, onClose, excluded, setExcluded }: { blinds: Blind[]; demo: boolean; onClose: () => void; excluded: string[]; setExcluded: (v: string[]) => void }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState(blinds.map((b) => ({ mac: b.mac, name: b.name, room: b.room })));
  const [busy, setBusy] = useState(false);
  const roomNames = [...new Set(rows.map((r) => r.room.trim()).filter(Boolean))];
  const upd = (i: number, k: "name" | "room", v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const save = async () => {
    setBusy(true);
    const cur = qc.getQueryData(blindsQuery.queryKey);
    if (cur) qc.setQueryData(blindsQuery.queryKey, { ...cur, blinds: cur.blinds.map((b) => {
      const r = rows.find((x) => x.mac === b.mac);
      return r ? { ...b, name: r.name.trim() || b.name, room: r.room.trim() } : b;
    }) });
    if (!demo) await saveBlindMeta({ data: { items: rows } }).catch(() => {});
    setBusy(false);
    onClose();
  };
  const field = "w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-xl border border-border bg-card sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="font-semibold">Redőnyök – nevek és szobák</h2>
          <button onClick={onClose} aria-label="Bezárás" className="text-muted-foreground">✕</button>
        </div>
        <datalist id="blind-rooms">{roomNames.map((r) => <option key={r} value={r} />)}</datalist>
        <div className="space-y-2 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground"><span>Név</span><span>Szoba</span></div>
          {rows.map((r, i) => (
            <div key={r.mac} className="grid grid-cols-2 gap-2">
              <input className={field} value={r.name} onChange={(e) => upd(i, "name", e.target.value)} aria-label="Név" />
              <input className={field} value={r.room} list="blind-rooms" placeholder="pl. Nappali" onChange={(e) => upd(i, "room", e.target.value)} aria-label="Szoba" />
              <label className="col-span-2 -mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={excluded.includes(r.mac)} onChange={(e) => setExcluded(e.target.checked ? [...excluded, r.mac] : excluded.filter((m) => m !== r.mac))} />
                Kihagyás a csoportos vezérlésből (Mind fel/le, szoba gombok)</label>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-4">
          <button className="rounded-md border border-border px-4 py-2 text-sm" onClick={onClose}>Mégse</button>
          <button disabled={busy} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50" onClick={save}>{busy ? "Mentés…" : "Mentés"}</button>
        </div>
      </div>
    </div>
  );
}
