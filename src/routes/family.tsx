import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { Copy, KeyRound, Trash2, UserPlus } from "lucide-react";
import { Shell, Card } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
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
const listQuery = { queryKey: ["family"], queryFn: () => familyList(), retry: false } as const;

function Family() {
  const { data, error, isLoading } = useQuery(listQuery);
  const qc = useQueryClient();
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
        <div>
          <h1 className="text-2xl font-semibold">Család és jogosultságok</h1>
          <p className="text-sm text-muted-foreground">
            Mindenki saját fiókkal lép be. A titkos kapcsolati adatokat csak az admin látja és
            módosíthatja.
          </p>
        </div>
        {isLoading && <p className="text-muted-foreground">Betöltés…</p>}
        {error && (
          <Card>
            <p>{(error as Error).message}</p>
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
              Küldd el {link.who} részére. 72 óráig érvényes, itt nem jelenik meg újra.
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
            <Card title="Új családtag">
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
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
                <Button className="h-11">
                  <UserPlus />
                  Meghívó link
                </Button>
              </form>
            </Card>
            <div className="family-grid">
              {data.users.map((u) => (
                <section key={u.id} className="family-card">
                  <div className="family-head">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">
                        {u.displayName}{" "}
                        {u.id === data.meId && (
                          <span className="text-xs text-muted-foreground">(te)</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        @{u.username} ·{" "}
                        {u.disabled
                          ? "letiltva"
                          : u.hasPassword
                            ? "aktív"
                            : "meghívó elküldve, jelszó még nincs"}
                      </div>
                    </div>
                    <select
                      aria-label={`${u.displayName} szerepköre`}
                      disabled={u.id === data.meId}
                      className="h-10 rounded-md border border-input bg-background px-3"
                      value={u.role}
                      onChange={(e) =>
                        void run(() => update({ data: { id: u.id, role: e.target.value as Role } }))
                      }
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
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
                      Jelszó link
                    </Button>
                    {u.id !== data.meId && (
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
                  {u.role !== "admin" && (
                    <div className="family-perms">
                      {PERMISSIONS.filter((p) => p !== "settings" && p !== "users").map(
                        (p: Permission) => {
                          const on = can(u.role, p, u.permissions);
                          return (
                            <label key={p} className="family-perm">
                              {PERMISSION_LABELS[p]}
                              <Switch
                                checked={on}
                                onCheckedChange={(v) =>
                                  void run(() =>
                                    update({
                                      data: { id: u.id, permissions: { ...u.permissions, [p]: v } },
                                    }),
                                  )
                                }
                              />
                            </label>
                          );
                        },
                      )}
                    </div>
                  )}
                </section>
              ))}
            </div>
          </fieldset>
        )}
      </div>
    </Shell>
  );
}
