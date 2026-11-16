import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DoorOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "./ui/sheet";
import { roomsGet, roomsChange } from "@/lib/rooms.functions";
import { emptyRooms, resolveRoom, roomCatalog, type RoomAction } from "@/lib/rooms";
import type { HomeDevice } from "@/lib/home-devices";
export const roomsQuery = {
  queryKey: ["home-rooms"],
  queryFn: () => roomsGet(),
  refetchInterval: 15_000,
  retry: false,
};
export function RoomsManager({
  devices,
  editable,
  selected,
  onClose,
}: {
  devices: HomeDevice[];
  editable: boolean;
  selected: string | null;
  onClose: () => void;
}) {
  const q = useQuery(roomsQuery);
  const change = useServerFn(roomsChange);
  const qc = useQueryClient();
  const state = q.data ?? emptyRooms;
  const catalog = roomCatalog(state, devices);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const save = async (action: RoomAction) => {
    if (busy || !q.data) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = await change({ data: { version: state.version, action } });
      qc.setQueryData(roomsQuery.queryKey, next);
      await qc.invalidateQueries({ queryKey: ["shared-prefs"] });
      setMessage("Szobabeállítás mentve.");
      setName("");
      setRenaming(null);
    } catch (e) {
      setError((e as Error).message);
      await q.refetch();
    } finally {
      setBusy(false);
    }
  };
  const list = devices.filter(
    (d) =>
      (selected === "all" || d.key === selected) &&
      d.name.toLocaleLowerCase("hu").includes(search.toLocaleLowerCase("hu")) &&
      (filter === "all" ||
        (filter === "none" ? !resolveRoom(state, d) : resolveRoom(state, d) === filter)),
  );
  return (
    <Sheet
      open={selected !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent side="right" className="flex h-dvh w-full flex-col overflow-hidden sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Szobák kezelése</SheetTitle>
          <SheetDescription>{devices.length} eszköz · közös szobabeosztás</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-6">
          {q.isPending && <p role="status">Szobák betöltése…</p>}
          {q.error && (
            <p role="alert" className="text-sm text-destructive">
              {(q.error as Error).message}
            </p>
          )}
          {!editable && (
            <p className="text-sm text-muted-foreground">
              A szobák módosításához szülői szobakezelési engedély szükséges.
            </p>
          )}
          {selected === "all" && (
            <>
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save(
                    renaming ? { type: "rename", from: renaming, name } : { type: "add", name },
                  );
                }}
              >
                <Input
                  aria-label={renaming ? "Új szobanév" : "Új szoba neve"}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={60}
                  placeholder={renaming ? "Új szobanév" : "Új szoba neve"}
                  disabled={!editable || busy || !q.data}
                />
                <Button
                  size="icon"
                  type="submit"
                  aria-label={renaming ? "Szoba átnevezése" : "Szoba felvétele"}
                  disabled={!editable || busy || !name.trim() || !q.data}
                >
                  {renaming ? <Pencil /> : <Plus />}
                </Button>
                {renaming && (
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => {
                      setRenaming(null);
                      setName("");
                    }}
                  >
                    Mégse
                  </Button>
                )}
              </form>
              <div className="divide-y divide-border">
                {catalog.map((room) => (
                  <div key={room} className="flex min-h-12 items-center gap-2">
                    <DoorOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 break-words text-sm">{room}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`${room} átnevezése`}
                      disabled={!editable || busy}
                      onClick={() => {
                        setRenaming(room);
                        setName(room);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`${room} törlése`}
                      disabled={!editable || busy}
                      onClick={() => {
                        if (
                          confirm(
                            `Törlöd a(z) ${room} szobát? Az eszközök szobabeosztás nélkül maradnak.`,
                          )
                        )
                          void save({ type: "remove", name: room });
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
          {selected === "all" && (
            <div className="grid gap-2">
              <Input
                aria-label="Eszköz keresése"
                placeholder="Eszköz keresése"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                aria-label="Szobaszűrő"
                className="h-11 min-w-0 rounded-md border border-input bg-background px-3 text-sm"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">Minden szoba</option>
                <option value="none">Nincs szobához rendelve</option>
                {catalog.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>
          )}
          <div className="divide-y divide-border">
            {list.map((d) => (
              <div key={d.key} className="grid gap-2 py-3">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="break-words text-sm font-medium">{d.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {d.online ? "Online" : "Offline"}
                  </span>
                </div>
                <select
                  aria-label={`${d.name} szobája`}
                  className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm"
                  disabled={!editable || busy || !q.data}
                  value={resolveRoom(state, d)}
                  onChange={(e) => void save({ type: "assign", key: d.key, room: e.target.value })}
                >
                  <option value="">Nincs szobához rendelve</option>
                  {catalog.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {list.length === 0 && !q.isPending && (
            <p className="text-sm text-muted-foreground">Nincs a szűrésnek megfelelő eszköz.</p>
          )}
          {selected !== "all" && (
            <Button
              variant="outline"
              onClick={() => {
                onClose();
              }}
            >
              Kész
            </Button>
          )}
          {message && (
            <p role="status" className="text-sm text-muted-foreground">
              {message}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
