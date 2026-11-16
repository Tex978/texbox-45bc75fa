import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  CalendarDays,
  ChefHat,
  ClipboardList,
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Pencil,
  RotateCcw,
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
import { dashboardGet, dashboardSave } from "@/lib/dashboard.functions";
import {
  CARD_LABELS,
  defaultPrefs,
  moveCard,
  type CardId,
  type DashboardPrefs,
} from "@/lib/dashboard-schema";
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

function HomeQuick({ favorites = [] }: { favorites?: string[] }) {
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
  const all = scenes.data?.scenes ?? [];
  // Personal favourite scenes (validated server-side) first; otherwise the newest six.
  const list = favorites.length
    ? favorites.map((id) => all.find((s) => s.id === id)).filter((s) => !!s)
    : all.slice(0, 6);
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
export const dashboardQuery = {
  queryKey: ["dashboard-prefs"],
  queryFn: () => dashboardGet({ data: {} }),
  retry: false,
} as const;
function Editor({
  draft,
  setDraft,
  allowed,
  onSave,
  onCancel,
  onReset,
  busy,
}: {
  draft: DashboardPrefs;
  setDraft: (p: DashboardPrefs) => void;
  allowed: CardId[];
  onSave: () => void;
  onCancel: () => void;
  onReset: () => void;
  busy: boolean;
}) {
  const scenes = useQuery({ queryKey: ["scenes"], queryFn: () => scenesList(), retry: false });
  const order = draft.order.filter((c) => allowed.includes(c));
  const toggleHidden = (c: CardId) =>
    setDraft({
      ...draft,
      hidden: draft.hidden.includes(c) ? draft.hidden.filter((x) => x !== c) : [...draft.hidden, c],
    });
  const toggleScene = (id: string) =>
    setDraft({
      ...draft,
      scenes: draft.scenes.includes(id)
        ? draft.scenes.filter((x) => x !== id)
        : [...draft.scenes, id],
    });
  return (
    <section className="dash-card dash-editor" aria-label="Főoldal szerkesztése">
      <h2 className="dash-sub">Kártyák sorrendje és láthatósága</h2>
      <ol className="dash-edit-list">
        {order.map((c, i) => {
          const hidden = draft.hidden.includes(c);
          return (
            <li key={c} className={hidden ? "is-hidden" : ""}>
              <span>{CARD_LABELS[c]}</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`${CARD_LABELS[c]} feljebb`}
                disabled={i === 0}
                onClick={() => setDraft({ ...draft, order: moveCard(order, c, -1) })}
              >
                <ArrowUp size={16} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`${CARD_LABELS[c]} lejjebb`}
                disabled={i === order.length - 1}
                onClick={() => setDraft({ ...draft, order: moveCard(order, c, 1) })}
              >
                <ArrowDown size={16} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-pressed={!hidden}
                aria-label={`${CARD_LABELS[c]} ${hidden ? "megjelenítése" : "elrejtése"}`}
                onClick={() => toggleHidden(c)}
              >
                {hidden ? <EyeOff size={16} /> : <Eye size={16} />}
              </Button>
            </li>
          );
        })}
      </ol>
      {allowed.includes("home") && (
        <>
          <h3 className="dash-sub">
            <Sparkles size={15} /> Kedvenc jelenetek a főoldalon
          </h3>
          {scenes.data?.scenes.length ? (
            <div className="dash-chips">
              {scenes.data.scenes.map((sc) => (
                <label key={sc.id} className="dash-chip">
                  <input
                    type="checkbox"
                    checked={draft.scenes.includes(sc.id)}
                    onChange={() => toggleScene(sc.id)}
                  />{" "}
                  {draft.scenes.includes(sc.id) ? `${draft.scenes.indexOf(sc.id) + 1}. ` : ""}
                  {sc.name}
                </label>
              ))}
            </div>
          ) : (
            <p className="dash-note">
              {scenes.error ? scenes.error.message : "Nincs elérhető mentett jelenet."}
            </p>
          )}
          <p className="dash-note">
            Konkrét kedvenc eszközök személyes kiválasztása később jön; addig a közös
            eszközcsoportok látszanak.
          </p>
        </>
      )}
      <div className="dash-edit-actions">
        <Button onClick={onSave} disabled={busy}>
          {busy ? "Mentés…" : "Mentés"}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={busy}>
          Mégse
        </Button>
        <Button variant="ghost" onClick={onReset} disabled={busy}>
          <RotateCcw size={14} /> Alapértelmezett visszaállítása
        </Button>
      </div>
    </section>
  );
}
export function Dashboard() {
  const me = useQuery(meQuery).data?.user;
  const child = me?.role === "child";
  const h = new Date().getHours();
  const qc = useQueryClient();
  const dash = useQuery({ ...dashboardQuery, enabled: !!me });
  const save = useServerFn(dashboardSave);
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState<DashboardPrefs | null>(null),
    [busy, setBusy] = useState(false),
    [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const prefs = dash.data?.prefs ?? defaultPrefs(child ? "child" : "adult");
  const allowed = dash.data?.allowed ?? prefs.order;
  useEffect(() => {
    if (!editing) setDraft(null);
  }, [editing]);
  async function persist(reset: boolean) {
    if (!dash.data || !draft) return;
    if (reset && !window.confirm("Visszaállítod a főoldalt az alapértelmezett elrendezésre?")) return;
    setBusy(true);
    setMsg(null);
    try {
      await save({ data: { version: dash.data.version, prefs: reset ? null : draft, reset } });
      await qc.invalidateQueries({ queryKey: dashboardQuery.queryKey });
      setEditing(false);
      setMsg({ text: reset ? "Alapértelmezett elrendezés visszaállítva." : "Főoldal mentve a NAS-on." });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "A mentés nem sikerült.", bad: true });
      if (e instanceof Error && e.message.includes("másik eszközön"))
        void qc.invalidateQueries({ queryKey: dashboardQuery.queryKey });
    } finally {
      setBusy(false);
    }
  }
  const cards: Record<CardId, ReactNode> = {
    home: <HomeQuick key="home" favorites={prefs.scenes} />,
    tasks: <TodayCard key="tasks" child={child} />,
    event: <NextEvent key="event" />,
    shopping: <Shopping key="shopping" />,
    menu: <TodayMenu key="menu" />,
    points: <Points key="points" />,
    media: <MediaCard key="media" />,
  };
  const visible = prefs.order.filter((c) => allowed.includes(c) && !prefs.hidden.includes(c));
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
        <div className="dash-hero-row">
          <p className="page-subtitle">
            {dash.data
              ? dash.data.saved
                ? "Saját, a NAS-on mentett elrendezésed."
                : "Alapértelmezett elrendezés — szerkesztéssel a saját fiókodhoz mentheted."
              : dash.error
                ? dash.error.message
                : me
                  ? "Elrendezés betöltése…"
                  : "Alapértelmezett elrendezés; a személyes főoldalhoz jelentkezz be a NAS-on."}
          </p>
          {dash.data && !editing && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDraft(prefs);
                setEditing(true);
                setMsg(null);
              }}
            >
              <Pencil size={14} /> Főoldal szerkesztése
            </Button>
          )}
        </div>
        {msg && (
          <p className={msg.bad ? "task-error" : "task-ok"} role="status">
            {msg.text}
          </p>
        )}
      </section>
      {editing && draft && (
        <Editor
          draft={draft}
          setDraft={setDraft}
          allowed={allowed}
          busy={busy}
          onSave={() => void persist(false)}
          onReset={() => void persist(true)}
          onCancel={() => setEditing(false)}
        />
      )}
      <div className="dash-grid">
        {visible.length ? (
          visible.map((c) => cards[c])
        ) : (
          <p className="dash-empty">Minden kártya el van rejtve. A szerkesztőben visszahozhatod őket.</p>
        )}
      </div>
    </div>
  );
}
