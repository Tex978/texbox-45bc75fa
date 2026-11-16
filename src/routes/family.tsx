import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import {
  Copy,
  KeyRound,
  Trash2,
  UserPlus,
  Baby,
  ShieldCheck,
  RefreshCw,
  LogOut,
} from "lucide-react";
import { Shell, Card, PageHeader } from "@/components/Shell";
import { StorageStatus } from "@/components/StorageStatus";
import { UserAvatar } from "@/components/Avatar";
import { AVATAR_ICONS, AVATAR_ICON_LABELS } from "@/lib/profile-schema";
import { auditList } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  familyCreateChild,
  familyUpdateChild,
  familyRevokeSessions,
  familyCreate,
  familyDelete,
  familyList,
  familyResetLink,
  familyUpdate,
} from "@/lib/auth.functions";
import {
  can,
  PERMISSIONS,
  PERMISSION_LABELS,
  ROLES,
  ROLE_LABELS,
  type Permission,
  type Role,
} from "@/lib/permissions";

export const Route = createFileRoute("/family")({
  head: () => ({
    meta: [
      { title: "Család és jogosultságok – TexBox" },
      {
        name: "description",
        content: "Családtagok fiókjai, meghívólinkek és jogosultságok kezelése.",
      },
      { property: "og:title", content: "Család és jogosultságok – TexBox" },
      { property: "og:description", content: "Családi fiókok kezelése a TexBoxban." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Family,
});
const PERM_GROUPS: { title: string; perms: Permission[] }[] = [
  { title: "Otthon és eszközök", perms: ["home", "locks", "rooms"] },
  { title: "Család, feladatok, jutalmak", perms: ["family"] },
  { title: "Média és letöltések", perms: ["request", "downloads"] },
];
const listQuery = { queryKey: ["family"], queryFn: () => familyList(), retry: false } as const;

export function Family() {
  const { data, error, isLoading, refetch } = useQuery(listQuery);
  const qc = useQueryClient();
  const createChild = useServerFn(familyCreateChild),
    updateChild = useServerFn(familyUpdateChild),
    revoke = useServerFn(familyRevokeSessions);
  const [child, setChild] = useState({ displayName: "", icon: "child" });
  const create = useServerFn(familyCreate),
    update = useServerFn(familyUpdate),
    reset = useServerFn(familyResetLink),
    remove = useServerFn(familyDelete);
  const [form, setForm] = useState({ username: "", displayName: "", role: "adult" as Role });
  const [link, setLink] = useState<{ who: string; url: string } | null>(null);
  const [msg, setMsg] = useState("");
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const run = async (fn: () => Promise<unknown>) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setMsg("");
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["family"] });
      await qc.invalidateQueries({ queryKey: ["me"] });
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };

  return (
    <Shell>
      <div className="mx-auto grid max-w-4xl gap-6">
        <PageHeader
          title="Család és fiókok"
          subtitle="Önálló felnőtt fiókok és szülők által kezelt gyermekprofilok."
        />
        {isLoading && <p className="text-muted-foreground">Betöltés…</p>}
        {data && <StorageStatus />}
        {error && (
          <Card>
            <p role="alert">{(error as Error).message}</p>
            <Button variant="outline" className="mt-3" onClick={() => void refetch()}>
              <RefreshCw />
              Újrapróbálás
            </Button>
          </Card>
        )}
        {msg && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm"
          >
            {msg}
          </div>
        )}
        {link && (
          <Card title="Egyszer használható link">
            <p className="mb-2 text-sm text-muted-foreground">
              Másold ki és küldd el {link.who} részére; e-mailt nem küldtünk. 72 óráig érvényes, itt
              nem jelenik meg újra.
            </p>
            <div tabIndex={0} className="family-link select-all">
              {link.url}
            </div>
            <Button
              className="mt-3"
              variant="secondary"
              onClick={async () => {
                try {
                  if (!navigator.clipboard) throw new Error();
                  await navigator.clipboard.writeText(link.url);
                  setCopyStatus("Link másolva.");
                } catch {
                  setCopyStatus("A másolás nem elérhető. Jelöld ki és másold a linket.");
                }
              }}
            >
              <Copy />
              Másolás
            </Button>
            {copyStatus && (
              <p role="status" className="mt-2 text-sm text-muted-foreground">
                {copyStatus}
              </p>
            )}
          </Card>
        )}
        {data && (
          <fieldset disabled={busy} className="min-w-0 space-y-6">
            {data.canManageAccounts && (
              <Card title="Felnőtt meghívása">
                <form
                  className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto]"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      const r = await create({ data: form });
                      setLink({ who: form.displayName || form.username, url: r.link });
                      setForm({ username: "", displayName: "", role: "adult" });
                    });
                  }}
                >
                  <Input
                    aria-label="Felhasználónév"
                    required
                    placeholder="Felhasználónév (pl. anna)"
                    autoCapitalize="none"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    className="h-11"
                  />
                  <Input
                    aria-label="Megjelenített név"
                    placeholder="Megjelenített név"
                    value={form.displayName}
                    onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                    className="h-11"
                  />
                  <select
                    aria-label="Szerepkör"
                    className="h-11 rounded-md border border-input bg-background px-3"
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                  >
                    {ROLES.filter((r) => r !== "child" && (r !== "admin" || data.owner)).map(
                      (r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ),
                    )}
                  </select>
                  <Button className="h-11">
                    <UserPlus />
                    Meghívó link
                  </Button>
                </form>
              </Card>
            )}
            <Card title="Gyermekprofil létrehozása">
              <form
                className="grid gap-3 sm:grid-cols-[1fr_auto_auto]"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    await createChild({ data: child });
                    setChild({ displayName: "", icon: "child" });
                  });
                }}
              >
                <Input
                  required
                  maxLength={60}
                  aria-label="Gyermek neve"
                  placeholder="Gyermek neve"
                  value={child.displayName}
                  onChange={(e) => setChild({ ...child, displayName: e.target.value })}
                  className="h-11"
                />
                <select
                  aria-label="Gyermek ikonja"
                  className="h-11 rounded-md border border-input bg-background px-3"
                  value={child.icon}
                  onChange={(e) => setChild({ ...child, icon: e.target.value })}
                >
{AVATAR_ICONS.filter((i) => i !== "initials").map((i) => (
                  <option key={i} value={i}>
                    {AVATAR_ICON_LABELS[i]}
                  </option>
                ))}
                </select>
                <Button className="h-11">
                  <Baby />
                  Profil létrehozása
                </Button>
              </form>
              <p className="mt-3 text-sm text-muted-foreground">
                Nem szükséges e-mail, felhasználónév vagy jelszó. Ezzel a profillal még nem lehet
                önállóan belépni.
              </p>
            </Card>
            <div className="family-grid">
              {data.children.map((c) => (
                <section key={c.id} className="family-card">
                  <div className="family-head">
                    <UserAvatar name={c.displayName} avatar={{ icon: c.icon as never, color: "c2" }} size={40} />
                    <div className="min-w-0 flex-1">
                      <strong>{c.displayName}</strong>
                      <p className="text-xs text-muted-foreground">
                        {c.disabled
                          ? "Inaktív profil"
                          : "Szülő által kezelt gyermekprofil · önálló belépés nincs"}
                      </p>
                    </div>
                  </div>
                  <form
                    className="grid gap-3 sm:grid-cols-[1fr_auto_auto]"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void run(() =>
                        updateChild({
                          data: {
                            id: c.id,
                            displayName: String(f.get("name")),
                            icon: String(f.get("icon")),
                            disabled: c.disabled,
                          },
                        }),
                      );
                    }}
                  >
                    <Input
                      name="name"
                      defaultValue={c.displayName}
                      key={c.displayName}
                      required
                      maxLength={60}
                      aria-label={`${c.displayName} új neve`}
                    />
                    <select
                      name="icon"
                      defaultValue={c.icon}
                      key={c.icon}
                      aria-label={`${c.displayName} ikonja`}
                      className="h-11 rounded-md border border-input bg-background px-3"
                    >
{AVATAR_ICONS.filter((i) => i !== "initials").map((i) => (
                  <option key={i} value={i}>
                    {AVATAR_ICON_LABELS[i]}
                  </option>
                ))}
                    </select>
                    <Button variant="secondary">Mentés</Button>
                  </form>
                  <Button
                    variant="outline"
                    onClick={() =>
                      void run(() => updateChild({ data: { ...c, disabled: !c.disabled } }))
                    }
                  >
                    {c.disabled ? "Profil aktiválása" : "Profil inaktiválása"}
                  </Button>
                </section>
              ))}
            </div>
            <h2 className="text-lg font-semibold">Önálló fiókok</h2>
            <div className="family-grid">
              {data.users.map((u) => (
                <section key={u.id} className="family-card">
                  <div className="family-head">
                    <UserAvatar name={u.displayName} avatar={u.avatar} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">
                        {u.displayName}{" "}
                        {u.owner && (
                          <span className="text-xs text-primary">
                            <ShieldCheck className="inline h-4 w-4" /> Tulajdonos
                          </span>
                        )}
                        {u.id === data.meId && (
                          <span className="text-xs text-muted-foreground">(te)</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {ROLE_LABELS[u.role]} · @{u.username} ·{" "}
                        {u.disabled
                          ? "letiltva"
                          : u.hasPassword
                            ? "aktív"
                            : u.inviteExpiresAt && u.inviteExpiresAt > Date.now()
                              ? "aktiválásra vár"
                              : "nincs aktív meghívó"}
                      </div>
                    </div>
                    <select
                      aria-label={`${u.displayName} szerepköre`}
                      disabled={
                        !data.canManageAccounts ||
                        u.owner ||
                        u.id === data.meId ||
                        (u.role === "admin" && !data.owner)
                      }
                      className="h-10 rounded-md border border-input bg-background px-3"
                      value={u.role}
                      onChange={(e) =>
                        void run(() => update({ data: { id: u.id, role: e.target.value as Role } }))
                      }
                    >
                      {ROLES.filter(
                        (r) => r === u.role || (r !== "child" && (r !== "admin" || data.owner)),
                      ).map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                    {data.canManageAccounts && (u.role !== "admin" || data.owner) && (
                      <Button
                        variant="secondary"
                        onClick={() =>
                          void run(async () =>
                            setLink({
                              who: u.displayName,
                              url: (await reset({ data: { id: u.id } })).link,
                            }),
                          )
                        }
                      >
                        <KeyRound />
                        {u.hasPassword ? "Jelszó-visszaállítás" : "Új meghívó"}
                      </Button>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {u.sessions} aktív munkamenet
                    </span>
                    {data.canManageAccounts &&
                      u.sessions > 0 &&
                      (u.role !== "admin" || data.owner) && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            if (confirm(`${u.displayName} összes munkamenetét megszünteted?`))
                              void run(() => revoke({ data: { id: u.id } }));
                          }}
                        >
                          <LogOut />
                          Munkamenetek lezárása
                        </Button>
                      )}
                    {data.canManageAccounts &&
                      !u.owner &&
                      u.id !== data.meId &&
                      (u.role !== "admin" || data.owner) && (
                        <>
                          <label className="flex items-center gap-2 text-sm">
                            Letiltva
                            <Switch
                              checked={u.disabled}
                              onCheckedChange={(v) =>
                                void run(() => update({ data: { id: u.id, disabled: v } }))
                              }
                            />
                          </label>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`${u.displayName} törlése`}
                            onClick={() => {
                              if (confirm(`Biztosan törlöd: ${u.displayName}?`))
                                void run(() => remove({ data: { id: u.id } }));
                            }}
                          >
                            <Trash2 />
                          </Button>
                        </>
                      )}
                  </div>
                  {data.canManageAccounts && u.role !== "admin" && (
                    <div className="grid gap-3">
                      {PERM_GROUPS.map((g) => {
                        const items = g.perms.filter((p) => u.role !== "child" || p !== "family");
                        if (!items.length) return null;
                        return (
                          <div key={g.title} className="perm-group">
                            <h4>{g.title}</h4>
                            <div className="family-perms">
                              {items.map((p: Permission) => (
                                <label key={p} className="family-perm">
                                  {PERMISSION_LABELS[p]}
                                  <Switch
                                    checked={can(u.role, p, u.permissions)}
                                    onCheckedChange={(v) =>
                                      void run(() =>
                                        update({
                                          data: { id: u.id, permissions: { ...u.permissions, [p]: v } },
                                        }),
                                      )
                                    }
                                  />
                                </label>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                      <p className="text-xs text-muted-foreground">
                        Kapcsolatok/titkos adatok és családtagok kezelése csak adminé. Jelenetekhez és
                        egyes eszközökhöz a Jelenetek oldalon adható külön engedély; szobánkénti
                        jogosultság még nincs.
                      </p>
                    </div>
                  )}
                </section>
              ))}
            </div>
          </fieldset>
        )}
        {data?.canManageAccounts && <FamilyAudit />}
      </div>
    </Shell>
  );
}

function FamilyAudit() {
  const q = useQuery({
    queryKey: ["audit", "family"],
    queryFn: () => auditList({ data: { scope: "family" } }),
    retry: false,
  });
  const [kind, setKind] = useState("all");
  const rows = (q.data ?? []).filter((a) =>
    kind === "all" ? true : kind === "family" ? a.action.startsWith("user-") || a.action.startsWith("child-") || a.action === "sessions-revoke" : !a.action.startsWith("user-") && !a.action.startsWith("child-"),
  );
  return (
    <Card title="Fiókesemények (admin)">
      <select
        aria-label="Eseményszűrő"
        className="mb-3 h-11 rounded-md border border-input bg-background px-3"
        value={kind}
        onChange={(e) => setKind(e.target.value)}
      >
        <option value="all">Minden esemény</option>
        <option value="family">Családtag-műveletek</option>
        <option value="self">Belépések és saját beállítások</option>
      </select>
      {q.error && <p role="alert">{(q.error as Error).message}</p>}
      {rows.slice(0, 50).map((a, i) => (
        <div key={i} className="audit-row">
          <span>
            <strong>{a.actor}</strong>: {a.label}
            {a.target ? ` – ${a.target}` : ""}
          </span>
          <span className="text-xs text-muted-foreground">
            {new Date(a.at).toLocaleString("hu-HU", { timeZone: "Europe/Budapest" })}
          </span>
        </div>
      ))}
      {!q.isLoading && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">Nincs megjeleníthető esemény.</p>
      )}
    </Card>
  );
}
