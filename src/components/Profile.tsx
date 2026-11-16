import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { KeyRound, LogOut, MonitorSmartphone, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { Card } from "@/components/Shell";
import { UserAvatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  auditList,
  passwordChange,
  profileGet,
  profileUpdate,
  sessionRevoke,
  sessionsList,
  sessionsRevokeOthers,
} from "@/lib/auth.functions";
import { ROLE_LABELS } from "@/lib/permissions";
import {
  AVATAR_COLORS,
  AVATAR_COLOR_LABELS,
  AVATAR_ICONS,
  AVATAR_ICON_LABELS,
  passwordProblem,
  passwordStrength,
  type AvatarColor,
  type AvatarIcon,
} from "@/lib/profile-schema";

const fmt = (t: number) =>
  new Intl.DateTimeFormat("hu-HU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Budapest",
  }).format(t);
const STRENGTH = ["Túl rövid", "Gyenge", "Megfelelő", "Erős"];

function useRunner() {
  const qc = useQueryClient();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (fn: () => Promise<string>, keys: string[][]) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMsg(null);
    try {
      setMsg({ ok: true, text: await fn() });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      for (const k of keys) await qc.invalidateQueries({ queryKey: k });
      lock.current = false;
      setBusy(false);
    }
  };
  return { busy, msg, run };
}
function Msg({ m }: { m: { ok: boolean; text: string } | null }) {
  if (!m) return null;
  return (
    <p
      role={m.ok ? "status" : "alert"}
      className={`text-sm ${m.ok ? "text-muted-foreground" : "text-destructive"}`}
    >
      {m.text}
    </p>
  );
}

export function ProfilePage() {
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => profileGet(), retry: false });
  if (profile.isLoading) return <p className="text-muted-foreground">Profil betöltése…</p>;
  if (profile.error || !profile.data)
    return (
      <Card>
        <p role="alert">{(profile.error as Error)?.message ?? "A profil nem olvasható."}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void profile.refetch()}>
            <RefreshCw /> Újrapróbálás
          </Button>
          <Button variant="secondary" asChild>
            <a href="/__login">Belépés</a>
          </Button>
        </div>
      </Card>
    );
  return (
    <div className="grid gap-6">
      <ProfileCard p={profile.data} />
      <PasswordCard username={profile.data.username} displayName={profile.data.displayName} />
      <div id="eszkozok" className="scroll-mt-24">
        <SessionsCard />
      </div>
      <AuditCard />
    </div>
  );
}

type P = Awaited<ReturnType<typeof profileGet>>;
function ProfileCard({ p }: { p: P }) {
  const save = useServerFn(profileUpdate);
  const { busy, msg, run } = useRunner();
  const [name, setName] = useState(p.displayName);
  const [icon, setIcon] = useState<AvatarIcon>(p.avatar.icon);
  const [color, setColor] = useState<AvatarColor>(p.avatar.color);
  useEffect(() => {
    setName(p.displayName);
    setIcon(p.avatar.icon);
    setColor(p.avatar.color);
  }, [p.displayName, p.avatar.icon, p.avatar.color, p.version]);
  return (
    <Card title="Saját profil">
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await save({ data: { displayName: name, icon, color, version: p.version } });
            return "Profil mentve. Minden eszközön a következő frissítéskor megjelenik.";
          }, [["profile"], ["me"], ["family"]]);
        }}
      >
        <div className="flex items-center gap-4">
          <UserAvatar name={name || p.username} avatar={{ icon, color }} size={64} />
          <div className="min-w-0">
            <div className="text-lg font-semibold">{name || p.username}</div>
            <div className="text-sm text-muted-foreground">
              @{p.username} · {ROLE_LABELS[p.role]}
              {p.owner && (
                <span className="ml-1 text-primary">
                  <ShieldCheck className="inline h-4 w-4" /> Tulajdonos
                </span>
              )}
            </div>
          </div>
        </div>
        <label className="grid gap-1 text-sm">
          Megjelenített név
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            required
            className="h-11"
          />
        </label>
        <p className="text-xs text-muted-foreground">
          A felhasználónév (@{p.username}) a belépéshez kell, és biztonsági okból nem módosítható.
        </p>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm">Profilikon</legend>
          <div className="profile-pick">
            {AVATAR_ICONS.map((i) => (
              <button
                type="button"
                key={i}
                aria-pressed={icon === i}
                aria-label={AVATAR_ICON_LABELS[i]}
                onClick={() => setIcon(i)}
              >
                <UserAvatar name={name || p.username} avatar={{ icon: i, color }} size={36} />
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm">Szín</legend>
          <div className="profile-pick">
            {AVATAR_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                aria-pressed={color === c}
                aria-label={AVATAR_COLOR_LABELS[c]}
                onClick={() => setColor(c)}
              >
                <UserAvatar name={name || p.username} avatar={{ icon, color: c }} size={36} />
              </button>
            ))}
          </div>
        </fieldset>
        <Msg m={msg} />
        <Button disabled={busy} className="h-11 w-full sm:w-fit">
          <Save /> Profil mentése
        </Button>
      </form>
    </Card>
  );
}

function PasswordCard({ username, displayName }: { username: string; displayName: string }) {
  const change = useServerFn(passwordChange);
  const { busy, msg, run } = useRunner();
  const [f, setF] = useState({ current: "", next: "", again: "", others: true });
  const problem = f.next ? passwordProblem(f.next, { username, displayName }) : null;
  const s = passwordStrength(f.next);
  return (
    <Card title="Jelszó módosítása">
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            if (f.next !== f.again) throw new Error("A két új jelszó nem egyezik.");
            const r = await change({
              data: { current: f.current, next: f.next, signOutOthers: f.others },
            });
            setF({ current: "", next: "", again: "", others: true });
            return r.signedOut
              ? `Jelszó módosítva, ${r.signedOut} másik eszköz kijelentkeztetve.`
              : "Jelszó módosítva.";
          }, [["sessions"], ["audit"]]);
        }}
      >
        <Input
          type="password"
          autoComplete="current-password"
          required
          aria-label="Jelenlegi jelszó"
          placeholder="Jelenlegi jelszó"
          value={f.current}
          onChange={(e) => setF({ ...f, current: e.target.value })}
          className="h-11"
        />
        <Input
          type="password"
          autoComplete="new-password"
          required
          aria-label="Új jelszó"
          placeholder="Új jelszó (legalább 10 karakter)"
          value={f.next}
          onChange={(e) => setF({ ...f, next: e.target.value })}
          className="h-11"
        />
        {f.next && (
          <p className="text-sm text-muted-foreground">
            Erősség: <strong>{STRENGTH[s]}</strong>
            {problem ? ` – ${problem}` : ""}
          </p>
        )}
        <Input
          type="password"
          autoComplete="new-password"
          required
          aria-label="Új jelszó újra"
          placeholder="Új jelszó újra"
          value={f.again}
          onChange={(e) => setF({ ...f, again: e.target.value })}
          className="h-11"
        />
        <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
          Minden más eszközömről jelentkeztessen ki
          <Switch checked={f.others} onCheckedChange={(v) => setF({ ...f, others: v })} />
        </label>
        <Msg m={msg} />
        <Button disabled={busy || !!problem} className="h-11 w-full sm:w-fit">
          <KeyRound /> Jelszó módosítása
        </Button>
      </form>
    </Card>
  );
}

function SessionsCard() {
  const q = useQuery({ queryKey: ["sessions"], queryFn: () => sessionsList(), retry: false });
  const revoke = useServerFn(sessionRevoke),
    others = useServerFn(sessionsRevokeOthers);
  const { busy, msg, run } = useRunner();
  const list = q.data ?? [];
  return (
    <Card title="Bejelentkezett eszközeim">
      <p className="mb-3 text-sm text-muted-foreground">
        Az eszköz nevét a böngésző által belépéskor küldött adatokból becsüljük; helyet és IP-címet
        nem tárolunk.
      </p>
      {q.isLoading && <p className="text-muted-foreground">Betöltés…</p>}
      {q.error && <p role="alert">{(q.error as Error).message}</p>}
      <div className="grid gap-2">
        {list.map((s) => (
          <div key={s.id} className="session-row">
            <div className="flex min-w-0 items-center gap-3">
              <MonitorSmartphone className="h-5 w-5 flex-none text-muted-foreground" />
              <div className="min-w-0">
                <div className="font-medium">
                  {s.device}{" "}
                  {s.current && <span className="text-xs text-primary">· ez az eszköz</span>}
                </div>
                <div className="text-xs text-muted-foreground">
                  Belépés: {fmt(s.createdAt)} · Lejár: {fmt(s.expiresAt)}
                </div>
              </div>
            </div>
            {s.current ? (
              <Button variant="outline" size="sm" asChild>
                <a href="/__logout">
                  <LogOut /> Kijelentkezés
                </a>
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await revoke({ data: { id: s.id } });
                    return "Eszköz kijelentkeztetve.";
                  }, [["sessions"], ["audit"]])
                }
              >
                <LogOut /> Kijelentkeztetés
              </Button>
            )}
          </div>
        ))}
      </div>
      {list.filter((s) => !s.current).length > 0 && (
        <Button
          className="mt-3"
          variant="secondary"
          disabled={busy}
          onClick={() => {
            if (confirm("Minden más eszközödről kijelentkeztetsz?"))
              void run(
                async () => `${(await others()).count} eszköz kijelentkeztetve.`,
                [["sessions"], ["audit"]],
              );
          }}
        >
          Minden más eszköz kijelentkeztetése
        </Button>
      )}
      <div className="mt-2">
        <Msg m={msg} />
      </div>
    </Card>
  );
}

function AuditCard() {
  const q = useQuery({
    queryKey: ["audit", "me"],
    queryFn: () => auditList({ data: { scope: "me" } }),
    retry: false,
  });
  return (
    <Card title="Fiókom eseményei">
      {q.isLoading && <p className="text-muted-foreground">Betöltés…</p>}
      {q.error && <p role="alert">{(q.error as Error).message}</p>}
      {q.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">Még nincs rögzített esemény.</p>
      )}
      <div>
        {q.data?.slice(0, 30).map((a, i) => (
          <div key={i} className="audit-row">
            <span>
              {a.label}
              {a.actor && a.action.startsWith("user-") ? ` – ${a.actor}` : ""}
            </span>
            <span className="text-xs text-muted-foreground">{fmt(a.at)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
