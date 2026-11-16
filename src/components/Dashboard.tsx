import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  CalendarDays,
  ChefHat,
  ClipboardList,
  Clapperboard,
  House,
  Play,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  Star,
  type LucideIcon,
} from "lucide-react";
import { Button } from "./ui/button";
import { meQuery } from "./Shell";
import { tasksQuery } from "./Tasks";
import { pointsQuery } from "./Rewards";
import { scenesList, scenesRun, scenesRuns } from "@/lib/scenes.functions";
import { shopList, menuGet } from "@/lib/organizer.functions";
import { calendarGet } from "@/lib/calendar.functions";
import { getOverview } from "@/lib/nas.functions";
import { sharedPrefsQuery } from "@/lib/use-shared-pref";
import { mealLabels } from "@/lib/organizer-schema";
import { addDays, budapestToday } from "@/lib/task-schema";

// Read-only family dashboard: every card uses an existing, ACL-checked server read; nothing is written on load.
type Q = { isPending: boolean; error: Error | null; refetch: () => unknown };
function Widget({
  title,
  icon: Icon,
  to,
  link,
  q,
  children,
  className = "",
}: {
  title: string;
  icon: LucideIcon;
  to: "/" | "/home" | "/tasks" | "/organizer" | "/rewards" | "/media";
  link: string;
  q?: Q;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`dash-card ${className}`} aria-label={title}>
      <header className="dash-card-head">
        <h2>
          <Icon size={18} strokeWidth={1.8} />
          {title}
        </h2>
        <Link to={to} className="dash-link">
          {link} →
        </Link>
      </header>
      {q?.isPending ? (
        <div className="dash-skeleton" aria-label="Betöltés">
          <span />
          <span />
        </div>
      ) : q?.error ? (
        <div className="dash-error" role="status">
          <AlertCircle size={16} />
          <span>{q.error.message}</span>
          <Button variant="ghost" size="sm" onClick={() => void q.refetch()}>
            <RefreshCw size={14} /> Újra
          </Button>
        </div>
      ) : (
        children
      )}
    </section>
  );
}
const Empty = ({ children }: { children: ReactNode }) => <p className="dash-empty">{children}</p>;
const homeCategories: Record<string, string> = {
  sensors: "Hőmérők",
  gree: "Klímák",
  air: "Légtisztító",
  blinds: "Redőnyök",
  tuya: "Smart Life",
  bosch: "Bosch",
  locks: "Zárak",
};
const runLabels: Record<string, string> = {
  running: "folyamatban",
  accepted: "parancsok elfogadva",
  partial: "részben sikertelen",
  failed: "sikertelen",
  interrupted: "megszakadt",
};

function HomeQuick() {
  const scenes = useQuery({ queryKey: ["scenes"], queryFn: () => scenesList(), retry: false });
  const prefs = useQuery(sharedPrefsQuery);
  const run = useServerFn(scenesRun),
    runs = useServerFn(scenesRuns);
  const [busy, setBusy] = useState(""),
    [result, setResult] = useState<{ id: string; text: string; bad?: boolean } | null>(null);
  const favs = (
    Array.isArray(prefs.data?.prefs?.["home-favorites"])
      ? (prefs.data.prefs["home-favorites"] as string[])
      : []
  ).filter((f) => homeCategories[f]);
  async function start(id: string, name: string) {
    if (busy) return;
    setBusy(id);
    setResult(null);
    try {
      const r = await run({ data: { id, requestId: crypto.randomUUID() } });
      const last = (await runs({ data: { id } })).find((x) => x.id === r.id);
      // The API accepting commands is not proof of physical state; say exactly what the run log reports.
      setResult({
        id,
        text: `${name}: ${last ? (runLabels[last.status] ?? last.status) : "elküldve"}`,
        bad: last?.status === "failed" || last?.status === "partial",
      });
    } catch (e) {
      setResult({
        id,
        text: e instanceof Error ? e.message : "A jelenet nem indult el.",
        bad: true,
      });
    } finally {
      setBusy("");
    }
  }
  const list = scenes.data?.scenes.slice(0, 6) ?? [];
  return (
    <Widget title="Otthon gyorsan" icon={House} to="/home" link="Okosotthon" className="dash-wide">
      <div className="dash-chips" aria-label="Kedvenc eszközcsoportok">
        {favs.length ? (
          favs.map((f) => (
            <Link key={f} to="/home" className="dash-chip">
              {homeCategories[f]}
            </Link>
          ))
        ) : (
          <Link to="/home" className="dash-chip">
            Kedvencek beállítása az Okosotthonban
          </Link>
        )}
      </div>
      <p className="dash-note">
        Az eszközök élő állapota és vezérlése az Okosotthon oldalon érhető el.
      </p>
      <h3 className="dash-sub">
        <Sparkles size={15} /> Jelenetek
      </h3>
      {scenes.isPending ? (
        <div className="dash-skeleton">
          <span />
        </div>
      ) : scenes.error ? (
        <div className="dash-error" role="status">
          <AlertCircle size={16} />
          <span>{scenes.error.message}</span>
        </div>
      ) : list.length ? (
        <div className="dash-scenes">
          {list.map((s) => (
            <Button
              key={s.id}
              variant="outline"
              className="dash-scene"
              disabled={!!busy}
              onClick={() => void start(s.id, s.name)}
            >
              <Play size={16} /> {busy === s.id ? "Fut…" : s.name}
            </Button>
          ))}
        </div>
      ) : (
        <Empty>
          Még nincs mentett jelenet. <Link to="/home">Jelenet létrehozása →</Link>
        </Empty>
      )}
      {result && (
        <p className={result.bad ? "task-error" : "task-ok"} role="status">
          {result.text}
        </p>
      )}
    </Widget>
  );
}
const statusText: Record<string, string> = {
  open: "nyitott",
  claimed: "elvállalva",
  pending: "szülői jóváhagyásra vár",
  returned: "visszaküldve",
};
function TodayCard({ child }: { child: boolean }) {
  const q = useQuery(tasksQuery);
  const d = q.data;
  const today = (d?.occurrences ?? []).filter(
    (o) =>
      o.date <= (d?.today ?? "") &&
      ["open", "claimed", "pending", "returned"].includes(o.status) &&
      (!o.assignee || o.assignee === d?.me),
  );
  const pending = d?.parent ? d.occurrences.filter((o) => o.status === "pending").length : 0;
  return (
    <Widget
      title="Mai feladatok"
      icon={ClipboardList}
      to="/tasks"
      link="Összes"
      q={q}
      className="dash-wide"
    >
      {pending > 0 && (
        <Link to="/tasks" className="dash-alert">
          {pending} gyermekfeladat vár jóváhagyásra
        </Link>
      )}
      {today.length ? (
        <ul className="dash-list">
          {today.slice(0, child ? 4 : 6).map((o) => (
            <li key={o.id}>
              <span>{o.body.title}</span>
              <small>
                {o.assignee ? statusText[o.status] : "bárki elvállalhatja"}
                {o.body.points ? ` · ${o.body.points} pont` : ""}
              </small>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Ma nincs nyitott teendőd.</Empty>
      )}
    </Widget>
  );
}
function NextEvent() {
  const get = useServerFn(calendarGet),
    today = budapestToday();
  const q = useQuery({
    queryKey: ["calendar", today, addDays(today, 14), ""],
    queryFn: () => get({ data: { from: today, to: addDays(today, 14) } }),
    retry: false,
    refetchInterval: 60000,
  });
  const items = q.data?.occurrences.slice(0, 3) ?? [];
  return (
    <Widget title="Következő program" icon={CalendarDays} to="/organizer" link="Naptár" q={q}>
      {items.length ? (
        <ul className="dash-list">
          {items.map((o) => (
            <li key={o.key}>
              <span>{o.title}</span>
              <small>
                {o.date === today
                  ? "Ma"
                  : new Date(`${o.date}T12:00:00Z`).toLocaleDateString("hu-HU", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      timeZone: "UTC",
                    })}
                {o.allDay ? " · egész nap" : ` · ${o.start}`}
                {o.location ? ` · ${o.location}` : ""}
              </small>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Nincs esemény a következő két hétben.</Empty>
      )}
    </Widget>
  );
}
function Shopping() {
  const q = useQuery({
    queryKey: ["org-shop"],
    queryFn: () => shopList(),
    retry: false,
    refetchInterval: 15000,
  });
  const open = q.data?.items.filter((i) => !i.checked) ?? [];
  return (
    <Widget title="Bevásárlás" icon={ShoppingCart} to="/organizer" link="Lista" q={q}>
      {open.length ? (
        <>
          <p className="dash-big">{open.length} tétel vár</p>
          <p className="dash-note">
            {open
              .slice(0, 5)
              .map((i) => i.name)
              .join(", ")}
            {open.length > 5 ? "…" : ""}
          </p>
        </>
      ) : (
        <Empty>A bevásárlólista üres.</Empty>
      )}
    </Widget>
  );
}
function TodayMenu() {
  const get = useServerFn(menuGet);
  const q = useQuery({
    queryKey: ["org-menu", "now"],
    queryFn: () => get({ data: {} }),
    retry: false,
    refetchInterval: 60000,
  });
  const today = q.data?.entries.filter((e) => e.day === q.data?.today) ?? [];
  return (
    <Widget title="Mai menü" icon={ChefHat} to="/organizer" link="Heti menü" q={q}>
      {today.length ? (
        <ul className="dash-list">
          {today.map((e) => (
            <li key={e.id}>
              <span>{e.title}</span>
              <small>{mealLabels[e.meal as keyof typeof mealLabels] ?? e.meal}</small>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Mára nincs betervezett étel.</Empty>
      )}
    </Widget>
  );
}
function Points() {
  const q = useQuery(pointsQuery);
  const d = q.data,
    me = d?.people.find((p) => p.key === d.me);
  const goal = d?.wishes.find((w) => w.person === d.me && w.goal),
    reward = d?.rewards.find((r) => r.id === goal?.rewardId);
  const reserved = d?.parent ? d.redemptions.filter((r) => r.status === "reserved").length : 0;
  return (
    <Widget title="Pontjaim" icon={Star} to="/rewards" link="Ajándékbolt" q={q}>
      {reserved > 0 && (
        <Link to="/rewards" className="dash-alert">
          {reserved} jutalomkérés vár döntésre
        </Link>
      )}
      {me ? (
        <>
          <p className="dash-big">{me.available.toLocaleString("hu-HU")} pont</p>
          {reward ? (
            <>
              <p className="dash-note">
                Cél: {reward.name} —{" "}
                {me.available >= reward.price
                  ? "beváltható!"
                  : `még ${(reward.price - me.available).toLocaleString("hu-HU")} pont`}
              </p>
              <progress
                className="dash-progress"
                max={Math.max(1, reward.price)}
                value={Math.max(0, Math.min(me.available, reward.price))}
              />
            </>
          ) : (
            <p className="dash-note">
              Nincs kiválasztott cél. <Link to="/rewards">Cél választása →</Link>
            </p>
          )}
        </>
      ) : (
        <Empty>Nincs pontegyenleg.</Empty>
      )}
    </Widget>
  );
}
function MediaCard() {
  const q = useQuery({
    queryKey: ["overview"],
    queryFn: () => getOverview(),
    retry: false,
    refetchInterval: 30000,
  });
  const d = q.data;
  const total = d?.volumes.reduce((a, v) => a + v.total, 0) ?? 0,
    used = d?.volumes.reduce((a, v) => a + v.used, 0) ?? 0;
  return (
    <Widget
      title="Média és NAS"
      icon={Clapperboard}
      to="/media"
      link="Részletek"
      q={q}
      className="dash-wide"
    >
      {d && (
        <div className="dash-stats">
          <span>
            <b>{d.streams.length}</b> lejátszás most
          </span>
          <span>
            <b>{d.recent.length}</b> friss tétel
          </span>
          <span>
            <b>{total ? `${(total - used).toFixed(1)} TB` : "–"}</b> szabad hely
          </span>
          {d.demo && (
            <span className="dash-note">Bemutató adat — a kapcsolatok még nincsenek beállítva</span>
          )}
        </div>
      )}
    </Widget>
  );
}
export function Dashboard() {
  const me = useQuery(meQuery).data?.user;
  const child = me?.role === "child";
  const h = new Date().getHours();
  return (
    <div className={`dash ${child ? "dash-child" : ""}`}>
      <section className="dash-hero">
        <p className="ov-eyebrow" suppressHydrationWarning>
          {new Date().toLocaleDateString("hu-HU", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
        <h1 suppressHydrationWarning>
          {h < 10 ? "Jó reggelt" : h < 18 ? "Szia" : "Jó estét"}
          {me ? `, ${me.displayName.split(" ")[0]}` : ""}!
        </h1>
        <p className="page-subtitle">
          A kártyák sorrendje egyelőre alapértelmezett; a személyes testreszabás a következő
          fejlesztési körben jön.
        </p>
      </section>
      <div className="dash-grid">
        <HomeQuick />
        <TodayCard child={child} />
        <NextEvent />
        <Shopping />
        <TodayMenu />
        <Points />
        <MediaCard />
      </div>
    </div>
  );
}
