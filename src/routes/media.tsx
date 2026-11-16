import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import {
  Clapperboard,
  Download,
  HardDrive,
  History,
  Cable,
  Play,
  Plus,
  Search,
} from "lucide-react";
import { Shell, Bar, Poster, EmptyState } from "@/components/Shell";
import { getOverview } from "@/lib/nas.functions";
const q = queryOptions({
  queryKey: ["overview"],
  queryFn: () => getOverview(),
  refetchInterval: 10000,
});
export const Route = createFileRoute("/media")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Média és NAS – TexBox" },
      { name: "description", content: "Plex aktivitás, friss médiák, letöltések és tárhely egy helyen." },
      { property: "og:title", content: "Média és NAS – TexBox" },
      {
        property: "og:description",
        content: "Plex aktivitás, friss médiák, letöltések és tárhely egy helyen.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(q),
  component: MediaOverview,
});
const thumb = (t?: string) => (t ? `/api/plex-thumb?path=${encodeURIComponent(t)}` : "");
const shortcuts = [
  { to: "/search", label: "Filmek és sorozatok", icon: Search },
  { to: "/library", label: "Tárhely", icon: HardDrive },
  { to: "/downloads", label: "Letöltések", icon: Download },
  { to: "/settings", label: "Kapcsolatok és állapot", icon: Cable },
] as const;
function MediaOverview() {
  const { data } = useSuspenseQuery(q);
  const total = data.volumes.reduce((a, v) => a + v.total, 0);
  const used = data.volumes.reduce((a, v) => a + v.used, 0);
  return (
    <Shell demo={data.demo}>
      <section className="ov-hero">
        <div className="min-w-0">
          <h1>Média és NAS</h1>
          <p className="page-subtitle">
            {data.streams.length
              ? `${data.streams.length} lejátszás fut most a Plexen.`
              : data.errors?.length
                ? "Egyes szolgáltatások adatai nem érhetők el."
                : "Most senki nem néz semmit a Plexen."}
          </p>
        </div>
      </section>

      {!!data.errors?.length && (
        <div role="alert" className="mb-4 text-sm text-destructive">
          {data.errors.join(" ")}
        </div>
      )}
      <div className="ov-stats">
        <div className="ov-stat">
          <HardDrive size={18} />
          <span className="ov-stat-label">Szabad hely</span>
          <b>{total ? `${(total - used).toFixed(1)} TB` : "–"}</b>
          {total > 0 && <Bar value={(used / total) * 100} />}
        </div>
        <div className="ov-stat">
          <Play size={18} />
          <span className="ov-stat-label">Most nézik</span>
          <b>{data.streams.length}</b>
        </div>
        <div className="ov-stat">
          <Plus size={18} />
          <span className="ov-stat-label">Friss a könyvtárban</span>
          <b>{data.recent.length}</b>
        </div>
      </div>

      <nav className="ov-shortcuts" aria-label="Gyors elérés">
        {shortcuts.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} className="ov-shortcut">
            <span>
              <Icon size={20} />
            </span>
            {label}
          </Link>
        ))}
      </nav>

      {data.streams.length > 0 && (
        <section className="ov-block">
          <h2 className="ov-title">
            <Play size={18} />
            Most nézik
          </h2>
          <div className="ov-streams">
            {data.streams.map((s, i) => (
              <div key={i} className="ov-stream">
                <div className="flex justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{s.title}</span>
                  <span className="shrink-0 font-mono text-xs text-primary">{s.mode}</span>
                </div>
                <div className="mb-2 text-xs text-muted-foreground">
                  {s.user} · {s.device} · {s.quality}
                </div>
                <Bar value={s.progress} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="ov-block">
        <h2 className="ov-title">
          <History size={18} />
          Nemrég nézett
        </h2>
        {data.watched.length ? (
          <div className="poster-row">
            {data.watched.map((r, i) => (
              <figure key={i}>
                <Poster src={thumb(r.thumb)} title={r.title} />
                <figcaption>
                  {r.title}
                  {r.who && <span> · {r.who}</span>}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <EmptyState icon={History} title="Nincs megtekintési előzmény">
            A Plex kapcsolat beállítása után itt jelennek meg.
          </EmptyState>
        )}
      </section>
      <section className="ov-block">
        <h2 className="ov-title">
          <Plus size={18} />
          Legutóbb hozzáadva
        </h2>
        {data.recent.length ? (
          <div className="poster-row">
            {data.recent.map((r, i) => (
              <figure key={i}>
                <Poster src={thumb(r.thumb)} title={r.title} />
                <figcaption>
                  {r.title}
                  {r.year ? <span> · {r.year}</span> : null}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <EmptyState icon={Plus} title="Még nincs friss tartalom" />
        )}
      </section>

      <section className="ov-block">
        <h2 className="ov-title">
          <HardDrive size={18} />
          Kötetek
        </h2>
        <div className="ov-volumes">
          {data.volumes.map((v) => (
            <div key={v.name} className="ov-stream">
              <div className="mb-2 flex justify-between gap-2 text-sm">
                <span>{v.name}</span>
                <span className="font-mono text-muted-foreground">
                  {v.used} / {v.total} TB
                </span>
              </div>
              <Bar value={(v.used / v.total) * 100} />
            </div>
          ))}
          {data.volumes.length === 0 && (
            <EmptyState icon={HardDrive} title="Nincs tárhelyadat">
              A Synology vagy Radarr kapcsolat szükséges.
            </EmptyState>
          )}
        </div>
      </section>
    </Shell>
  );
}
