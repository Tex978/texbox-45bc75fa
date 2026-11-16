import { useQuery } from "@tanstack/react-query";
import { HardDrive, RefreshCw } from "lucide-react";
import { Card } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { getStorageStatus } from "@/lib/auth.functions";

type Report = Awaited<ReturnType<typeof getStorageStatus>>;
type FileCheck = Report["db"];
const GUARD: Record<Report["guard"], string> = {
  ready: "Rendben – ismert telepítés",
  adoptable: "Korábbi adatok, jelző még nincs",
  "new-install": "Üres mappa, új telepítés nincs megerősítve",
  blocked: "Leállítva – adathiba",
  preview: "Előnézet – nem a NAS tárolója",
};
const when = (s: string | null) => (s ? new Date(s).toLocaleString("hu-HU") : "–");
const size = (n: number | null) =>
  n === null ? "" : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.ceil(n / 1024)} kB`;
function Row({ label, f, optional }: { label: string; f: FileCheck; optional?: boolean }) {
  const bad = !f.exists ? !optional : !f.readable;
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 py-2 text-sm last:border-0">
      <span>
        <b>{label}</b> <code className="text-xs text-muted-foreground">{f.path}</code>
      </span>
      <span className={bad ? "text-destructive" : "text-muted-foreground"}>
        {!f.exists
          ? optional
            ? "nincs (normális lehet)"
            : "HIÁNYZIK"
          : `${f.readable ? "olvasható" : "NEM olvasható"}, ${f.writable ? "írható" : "nem írható"} ${size(f.size)} · ${when(f.modified)}`}
      </span>
    </li>
  );
}

/** Admin-only, read-only storage health card; renders nothing for non-admins. */
export function StorageStatus() {
  const { data, error, refetch, isFetching } = useQuery({
    queryKey: ["storage-status"],
    queryFn: () => getStorageStatus(),
    retry: false,
  });
  if (error || !data) return null;
  const warn =
    data.guard === "blocked" ||
    data.mount.status === "container-filesystem" ||
    !data.dataFileInDataDir;
  return (
    <Card title="Adattárolás állapota">
      <div className="grid gap-3">
        <p
          className={`flex items-center gap-2 text-sm font-medium ${warn ? "text-destructive" : ""}`}
        >
          <HardDrive className="size-4" /> {GUARD[data.guard]}
        </p>
        {data.guardMessage && (
          <p role="alert" className="text-sm text-destructive">
            {data.guardMessage}
          </p>
        )}
        <ul>
          <Row label="Data mappa" f={data.dir} />
          <Row label="Fiókadatbázis" f={data.db} />
          <Row label="Adatbázis-napló (WAL)" f={data.dbWal} optional />
          <Row label="Közös beállítások" f={data.state} optional={!data.marker?.tracksState} />
        </ul>
        <dl className="grid gap-1 text-sm sm:grid-cols-2">
          <dt className="text-muted-foreground">Csatolás</dt>
          <dd className={data.mount.status === "container-filesystem" ? "text-destructive" : ""}>
            {data.mount.detail}
          </dd>
          <dt className="text-muted-foreground">Telepítésjelző</dt>
          <dd>
            {data.marker
              ? `${data.marker.origin === "new-install" ? "új telepítés" : "meglévő adatokból"}, ${when(data.marker.createdAt)}${data.marker.envBound ? ", TEXBOX_INSTANCE_ID-hez kötve" : ""}`
              : "nincs"}
          </dd>
          <dt className="text-muted-foreground">Példányazonosító</dt>
          <dd>{data.instanceIdConfigured ? "beállítva" : "nincs beállítva (ajánlott)"}</dd>
          <dt className="text-muted-foreground">Napi mentések</dt>
          <dd>
            {data.backups.count
              ? `${data.backups.count} db, legutóbbi: ${data.backups.newest} (${when(data.backups.newestAt)})`
              : "nincs mentés"}
          </dd>
          {!data.dataFileInDataDir && (
            <>
              <dt className="text-muted-foreground">Figyelem</dt>
              <dd className="text-destructive">A DATA_FILE nem a DATA_DIR mappában van.</dd>
            </>
          )}
        </dl>
        <p className="text-xs text-muted-foreground">
          Csak olvasó ellenőrzés: nem ír és nem hoz létre fájlt. A NAS-on a teljes data mappát
          mentsd (Hyper Backup).
        </p>
        <Button
          variant="outline"
          size="sm"
          className="justify-self-start"
          disabled={isFetching}
          onClick={() => void refetch()}
        >
          <RefreshCw /> Frissítés
        </Button>
      </div>
    </Card>
  );
}
