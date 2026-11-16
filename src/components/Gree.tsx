import { Link } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useRef, useState, useSyncExternalStore } from "react";
import { Fan, LoaderCircle, Minus, Plus, Power, Settings2, Snowflake } from "lucide-react";
import { SmartSection } from "@/components/SmartHomeUI";
import { Button } from "@/components/ui/button";
import { getGree, greeControl } from "@/lib/nas.functions";
import { GREE_FANS, GREE_MODES } from "@/lib/gree-rules";
import { renameGreeRoom, useGreeRooms } from "@/lib/gree-rooms";
export const greeQuery = queryOptions({
  queryKey: ["gree"],
  queryFn: () => getGree(),
  staleTime: 60_000,
  refetchInterval: 60_000,
  retry: false,
});
const modeLabels = {
  auto: "Automatikus",
  cool: "Hűtés",
  heat: "Fűtés",
  dry: "Páramentesítés",
  fan_only: "Ventilátor",
};
const fanLabels = {
  auto: "Automatikus",
  low: "Alacsony",
  mediumLow: "Közepesen alacsony",
  medium: "Közepes",
  mediumHigh: "Közepesen magas",
  high: "Magas",
};
type Unit = Awaited<ReturnType<typeof getGree>>["units"][number];
type CommandState = { busy: boolean; error: string };
const idle: CommandState = { busy: false, error: "" };
let commands: Record<string, CommandState> = {};
const listeners = new Set<() => void>();
const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
};
function updateCommand(ip: string, state: CommandState) {
  commands = { ...commands, [ip]: state };
  listeners.forEach((f) => f());
}
function useCommand(unit: Unit) {
  const qc = useQueryClient();
  const state = useSyncExternalStore(
    subscribe,
    () => commands[unit.ip] ?? idle,
    () => idle,
  );
  const send = async (property: string, value: string | number) => {
    if (!unit.online || commands[unit.ip]?.busy) return;
    updateCommand(unit.ip, { busy: true, error: "" });
    try {
      await greeControl({ data: { ip: unit.ip, property, value } });
      await qc.invalidateQueries({ queryKey: ["gree"] });
      updateCommand(unit.ip, idle);
    } catch (e) {
      updateCommand(unit.ip, {
        busy: false,
        error: e instanceof Error ? e.message : "A klíma nem fogadta el a parancsot.",
      });
    }
  };
  return { ...state, send };
}
function temperatureOf(unit: Unit) {
  const t = unit.properties["temperature"];
  return typeof t === "number" && Number.isFinite(t) ? t : null;
}
export function GreeQuickControls({ unit }: { unit: Unit }) {
  const { busy, error, send } = useCommand(unit);
  const t = temperatureOf(unit);
  const on = unit.properties["power"] === "on";
  return (
    <div className="gree-quick-controls" aria-busy={busy}>
      <div className="gree-quick-buttons">
        <Button
          variant={on ? "default" : "outline"}
          size="icon"
          title={on ? "Kikapcsolás" : "Bekapcsolás"}
          aria-label={`${unit.name} ${on ? "kikapcsolás" : "bekapcsolás"}`}
          disabled={busy || !unit.online}
          onClick={() => void send("power", on ? "off" : "on")}
        >
          {busy ? <LoaderCircle className="animate-spin" /> : <Power />}
        </Button>
        {t != null && (
          <>
            <Button
              variant="ghost"
              size="icon"
              title="Hőmérséklet csökkentése"
              aria-label={`${unit.name} gyors hőmérséklet csökkentése`}
              disabled={busy || !unit.online || t <= 16}
              onClick={() => void send("temperature", t - 1)}
            >
              <Minus />
            </Button>
            <span className="tabular-nums">{t}°</span>
            <Button
              variant="ghost"
              size="icon"
              title="Hőmérséklet növelése"
              aria-label={`${unit.name} gyors hőmérséklet növelése`}
              disabled={busy || !unit.online || t >= 30}
              onClick={() => void send("temperature", t + 1)}
            >
              <Plus />
            </Button>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="break-words text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
function GreeDevice({ unit }: { unit: Unit }) {
  const { busy, error, send } = useCommand(unit);
  const temperature = temperatureOf(unit);
  const on = unit.properties["power"] === "on";
  return (
    <section
      className="smart-device gree-detail space-y-4"
      aria-label={`${unit.name} részletes vezérlés`}
      aria-busy={busy}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Snowflake size={22} className="shrink-0 text-home-water" />
          <div className="min-w-0">
            <h3 className="break-words font-semibold">{unit.name}</h3>
            <p className="text-xs text-muted-foreground">
              {unit.online ? (on ? "Online · Bekapcsolva" : "Online · Kikapcsolva") : "Offline"}
            </p>
          </div>
        </div>
        <Button
          variant={on ? "default" : "outline"}
          size="icon"
          title={on ? "Kikapcsolás" : "Bekapcsolás"}
          aria-label={`${unit.name} panel ${on ? "kikapcsolás" : "bekapcsolás"}`}
          disabled={busy || !unit.online}
          onClick={() => void send("power", on ? "off" : "on")}
        >
          {busy ? <LoaderCircle className="animate-spin" /> : <Power />}
        </Button>
      </div>
      <div className="gree-temperature">
        <span className="text-xs text-muted-foreground">Célhőmérséklet</span>
        <div>
          <Button
            variant="outline"
            size="icon"
            aria-label={`${unit.name} hőmérséklet csökkentése`}
            disabled={busy || !unit.online || temperature == null || temperature <= 16}
            onClick={() => {
              if (temperature != null) void send("temperature", temperature - 1);
            }}
          >
            <Minus />
          </Button>
          <strong>{temperature ?? "–"}°</strong>
          <Button
            variant="outline"
            size="icon"
            aria-label={`${unit.name} hőmérséklet növelése`}
            disabled={busy || !unit.online || temperature == null || temperature >= 30}
            onClick={() => {
              if (temperature != null) void send("temperature", temperature + 1);
            }}
          >
            <Plus />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
        <label className="min-w-0 text-xs text-muted-foreground">
          Üzemmód
          <select
            className="mt-1 w-full rounded-md border border-input bg-background px-2 text-foreground"
            aria-label={`${unit.name} üzemmód`}
            value={String(unit.properties["mode"] ?? "")}
            disabled={busy || !unit.online}
            onChange={(e) => void send("mode", e.target.value)}
          >
            <option value="" disabled>
              –
            </option>
            {GREE_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {modeLabels[mode]}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Fan size={12} />
            Ventilátor
          </span>
          <select
            className="mt-1 w-full rounded-md border border-input bg-background px-2 text-foreground"
            aria-label={`${unit.name} ventilátor`}
            value={String(unit.properties["fanSpeed"] ?? "")}
            disabled={busy || !unit.online}
            onChange={(e) => void send("fanSpeed", e.target.value)}
          >
            <option value="" disabled>
              –
            </option>
            {GREE_FANS.map((fan) => (
              <option key={fan} value={fan}>
                {fanLabels[fan]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!unit.online && (
        <p className="text-sm text-muted-foreground">
          {unit.error || "A klíma jelenleg nem elérhető."}
        </p>
      )}
      {error && (
        <p role="alert" className="break-words text-xs text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
export function Gree({
  selectedIp,
  onSelect,
}: {
  selectedIp?: string | null | undefined;
  onSelect?: ((ip: string) => void) | undefined;
}) {
  const { data } = useSuspenseQuery(greeQuery);
  const [localSelected, setLocalSelected] = useState<string | null>(null);
  const [roomFilter, setRoomFilter] = useState("all");
  const [roomName, setRoomName] = useState("");
  const { state, save, error } = useGreeRooms();
  const detailRef = useRef<HTMLDivElement>(null);
  const list = data.units.filter(
    (u) =>
      roomFilter === "all" ||
      (roomFilter === "none" ? !state.assignments[u.ip] : `room:${state.assignments[u.ip]}` === roomFilter),
  );
  const selected = list.find((u) => u.ip === (selectedIp ?? localSelected)) ?? list[0];
  const select = (ip: string) => {
    setLocalSelected(ip);
    onSelect?.(ip);
    detailRef.current?.scrollIntoView?.({ block: "start", behavior: "instant" });
  };
  return (
    <SmartSection
      title="Gree klímák"
      action={
        <Button variant="ghost" size="icon" title="Kapcsolatok" asChild>
          <Link to="/settings">
            <Settings2 />
          </Link>
        </Button>
      }
    >
      {data.error && (
        <p role="alert" className="mb-3 break-words text-sm text-destructive">
          {data.error}
        </p>
      )}
      {!data.configured ? (
        <p className="text-sm text-muted-foreground">Nincs csatlakoztatott klíma.</p>
      ) : data.units.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nem találtunk klímát a Gree+ fiókban.</p>
      ) : (
        <>
          <div className="gree-room-filters" aria-label="Klímák szobaszűrője">
            {[
              { id: "all", label: "Összes" },
              ...state.rooms.map((r) => ({ id: `room:${r}`, label: r })),
              { id: "none", label: "Szoba nélkül" },
            ].map(({ id, label }) => (
              <Button
                key={id}
                variant={roomFilter === id ? "secondary" : "ghost"}
                aria-pressed={roomFilter === id}
                onClick={() => setRoomFilter(id)}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="gree-workspace">
            <div className="gree-unit-list">
              {list.map((unit) => (
                <div
                  key={unit.ip}
                  className={`gree-row ${selected?.ip === unit.ip ? "gree-row-selected" : ""}`}
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                    <Button
                      variant="ghost"
                      className="gree-unit-select"
                      aria-pressed={selected?.ip === unit.ip}
                      onClick={() => select(unit.ip)}
                      aria-label={`${unit.name} kiválasztása`}
                    >
                      <Snowflake className="shrink-0 text-home-water" />
                      <span className="min-w-0">
                        <strong className="block truncate">{unit.name}</strong>
                        <span className="gree-status">
                          <span className={`hd-dot ${unit.online ? "hd-dot-on" : "hd-dot-off"}`} />
                          {unit.online ? "Online" : "Offline"}
                          {state.assignments[unit.ip] ? ` · ${state.assignments[unit.ip]}` : ""}
                        </span>
                      </span>
                    </Button>
                    {temperatureOf(unit) != null && (
                      <span className="text-lg tabular-nums">{temperatureOf(unit)}°</span>
                    )}
                  </div>
                  <GreeQuickControls unit={unit} />
                </div>
              ))}
              {!list.length && <p className="hd-empty">Ebben a szobában nincs klíma.</p>}
            </div>
            <div className="gree-detail-anchor" ref={detailRef}>
              {selected && (
                <>
                  <GreeDevice unit={selected} />
                  <label className="mt-4 block text-sm">
                    Szoba · {selected.name}
                    <select
                      className="mt-2 w-full rounded-md border border-input bg-background px-3"
                      aria-label={`${selected.name} szobája`}
                      value={state.assignments[selected.ip] ?? ""}
                      onChange={(e) =>
                        save({
                          ...state,
                          assignments: { ...state.assignments, [selected.ip]: e.target.value },
                        })
                      }
                    >
                      <option value="">Szoba nélkül</option>
                      {state.rooms.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
          </div>
        </>
      )}
      <details className="gree-room-editor">
        <summary>Szobák szerkesztése</summary>
        <p className="my-3 text-xs text-muted-foreground">
          A szobabeosztás csak ebben a böngészőben mentődik.
        </p>
        <form
          className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const name = roomName.trim();
            if (name) {
              save({ ...state, rooms: [...new Set([...state.rooms, name])] });
              setRoomName("");
            }
          }}
        >
          <input
            className="min-w-0 rounded-md border border-input bg-background px-3"
            aria-label="Új szoba neve"
            placeholder="Szoba neve"
            maxLength={80}
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
          />
          <Button
            variant="outline"
            size="icon"
            type="submit"
            aria-label="Szoba hozzáadása"
            title="Szoba hozzáadása"
            disabled={!roomName.trim()}
          >
            <Plus />
          </Button>
        </form>
        {state.rooms.map((room) => (
          <RoomNameEditor
            key={room}
            room={room}
            onSave={(name) => {
              save(renameGreeRoom(state, room, name));
                if (roomFilter === `room:${room}`) setRoomFilter(`room:${name.trim()}`);
            }}
          />
        ))}
      </details>
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </SmartSection>
  );
}
function RoomNameEditor({ room, onSave }: { room: string; onSave: (name: string) => void }) {
  const [name, setName] = useState(room);
  return (
    <form
      className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(name);
      }}
    >
      <input
        aria-label={`${room} átnevezése`}
        className="min-w-0 rounded-md border border-input bg-background px-3"
        maxLength={80}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Button variant="outline" type="submit" disabled={!name.trim() || name.trim() === room}>
        Mentés
      </Button>
    </form>
  );
}
