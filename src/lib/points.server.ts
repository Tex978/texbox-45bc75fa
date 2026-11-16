import { db, getUser, listUsers, listChildProfiles, userCan, type User } from "./auth.server";
import { rewardSchema, type RewardInput, type RedemptionStatus } from "./points-schema";

// Personal points only: every balance belongs to exactly one user:<id> or profile:<id>; there is no family pool.
const store = () => {
  const d = db();
  if (!d)
    throw new Error(
      "A pontok és az ajándékbolt csak a saját Synology NAS-on mentődnek; az előnézet nem éri el őket.",
    );
  return d;
};
function current(user: User) {
  const u = getUser(user.id);
  if (!u || u.disabled) throw new Error("Bejelentkezés szükséges.");
  return u;
}
const isParent = (u: User) => u.role !== "child" && userCan(u, "family");
const me = (u: User) => `user:${u.id}`;
function tx<T>(fn: () => T): T {
  const d = store();
  d.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    d.exec("COMMIT");
    return r;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}
export function people() {
  return [
    ...listUsers()
      .filter((p) => !p.disabled)
      .map((p) => ({ key: `user:${p.id}`, name: p.displayName, child: p.role === "child", adminUser: p.role === "admin" })),
    ...listChildProfiles()
      .filter((p) => !p.disabled)
      .map((p) => ({ key: `profile:${p.id}`, name: p.displayName, child: true, adminUser: false })),
  ];
}
function person(key: string) {
  const p = people().find((v) => v.key === key);
  if (!p) throw new Error("Ismeretlen vagy inaktív családtag.");
  return p;
}
/** Who may see/act for a person: self always; parents for children only. */
function mayManage(u: User, key: string) {
  return key === me(u) || (isParent(u) && person(key).child);
}
const audit = (u: User, action: string, target: string) =>
  store()
    .prepare("INSERT INTO audit_log(user_id,action,target,at) VALUES(?,?,?,?)")
    .run(u.id, action, target, Date.now());

/** Called inside the task approval transaction; UNIQUE source makes it exactly-once. */
export function creditTask(occurrenceId: string) {
  store()
    .prepare(
      `INSERT OR IGNORE INTO point_ledger(person_key,delta,kind,source,reason,actor,at)
       SELECT person_key,points,'task','task:'||occurrence_id,'Jóváhagyott feladat',approved_by,approved_at
       FROM task_approvals WHERE occurrence_id=? AND points>0`,
    )
    .run(occurrenceId);
}
export function balanceOf(key: string) {
  const r = store()
    .prepare(
      `SELECT COALESCE(SUM(delta),0) balance,
        COALESCE(SUM(CASE WHEN delta>0 THEN delta END),0) earned,
        COALESCE(-SUM(CASE WHEN kind='redeem' THEN delta END),0) spent
       FROM point_ledger WHERE person_key=?`,
    )
    .get(key) as { balance: number; earned: number; spent: number };
  const res = store()
    .prepare("SELECT COALESCE(SUM(price),0) v FROM redemptions WHERE person_key=? AND status='reserved'")
    .get(key) as { v: number };
  const balance = Number(r.balance),
    reserved = Number(res.v);
  return { balance, earned: Number(r.earned), spent: Number(r.spent), reserved, available: balance - reserved };
}
type RewardRow = {
  id: string; name: string; description: string; category: string; price: number;
  stock: number | null; eligible: string; image: string; active: number; archived: number; version: number;
};
const rewardOut = (r: RewardRow) => ({
  id: r.id, name: r.name, description: r.description, category: r.category, price: r.price,
  stock: r.stock, eligible: JSON.parse(r.eligible) as string[], image: r.image,
  active: !!r.active, archived: !!r.archived, version: r.version,
});
const rewardRow = (id: string) =>
  store().prepare("SELECT * FROM rewards WHERE id=?").get(id) as RewardRow | undefined;
const eligibleFor = (r: { eligible: string[] }, key: string) => !r.eligible.length || r.eligible.includes(key);

export function pointsOverview(user: User) {
  const u = current(user),
    parent = isParent(u),
    all = people(),
    visible = all.filter((p) => p.key === me(u) || (parent && p.child));
  const history = (key: string) =>
    store()
      .prepare("SELECT id,delta,kind,reason,at FROM point_ledger WHERE person_key=? ORDER BY id DESC LIMIT 100")
      .all(key) as { id: number; delta: number; kind: string; reason: string; at: number }[];
  const keys = visible.map((p) => p.key);
  const rewards = (store().prepare("SELECT * FROM rewards ORDER BY archived,category,price").all() as RewardRow[])
    .map(rewardOut)
    .filter((r) => parent || (!r.archived && r.active && keys.some((k) => eligibleFor(r, k))));
  const wishes = (store().prepare("SELECT * FROM reward_wishes").all() as { person_key: string; reward_id: string; goal: number }[])
    .filter((w) => keys.includes(w.person_key))
    .map((w) => ({ person: w.person_key, rewardId: w.reward_id, goal: !!w.goal }));
  const redemptions = (store()
    .prepare("SELECT * FROM redemptions ORDER BY created_at DESC LIMIT 300")
    .all() as {
      id: string; reward_name: string; person_key: string; price: number; status: RedemptionStatus;
      requested_by: string; reason: string; version: number; created_at: number;
    }[])
    .filter((r) => keys.includes(r.person_key))
    .map((r) => ({
      id: r.id, rewardName: r.reward_name, person: r.person_key, price: r.price, status: r.status,
      requestedBy: getUser(r.requested_by)?.displayName ?? "Korábbi családtag",
      reason: r.reason, version: r.version, at: r.created_at,
    }));
  return {
    me: me(u),
    parent,
    admin: u.role === "admin",
    people: visible.map((p) => ({ ...p, ...balanceOf(p.key), history: history(p.key) })),
    allPeople: parent ? all.map((p) => ({ key: p.key, name: p.name })) : [],
    rewards,
    wishes,
    redemptions,
  };
}
export function adjustPoints(user: User, input: { person: string; delta: number; reason: string; requestId: string }) {
  return tx(() => {
    const u = current(user),
      p = person(input.person),
      reason = input.reason.trim();
    if (!isParent(u)) throw new Error("Pontot csak jogosult szülő korrigálhat.");
    if (input.person === me(u)) throw new Error("A saját pontjaidat nem korrigálhatod.");
    if (!p.child && u.role !== "admin") throw new Error("Felnőtt pontjait csak admin korrigálhatja.");
    if (!Number.isInteger(input.delta) || !input.delta || Math.abs(input.delta) > 100000)
      throw new Error("A korrekció 1 és 100 000 pont közötti egész szám lehet.");
    if (reason.length < 3) throw new Error("A korrekcióhoz indoklás szükséges.");
    store()
      .prepare("INSERT OR IGNORE INTO point_ledger(person_key,delta,kind,source,reason,actor,at) VALUES(?,?,?,?,?,?,?)")
      .run(input.person, input.delta, "adjust", `adjust:${input.requestId}`, reason.slice(0, 500), u.id, Date.now());
    audit(u, "points-adjust", `${input.person}:${input.delta}`);
    return balanceOf(input.person);
  });
}
export function saveReward(user: User, raw: RewardInput) {
  return tx(() => {
    const u = current(user),
      r = rewardSchema.parse(raw);
    if (!isParent(u)) throw new Error("Jutalmat csak szülő vagy admin szerkeszthet.");
    for (const k of r.eligible) person(k);
    const now = Date.now();
    if (r.id) {
      const res = store()
        .prepare(
          "UPDATE rewards SET name=?,description=?,category=?,price=?,stock=?,eligible=?,image=?,active=?,archived=?,version=version+1,updated_at=? WHERE id=? AND version=?",
        )
        .run(r.name, r.description, r.category, r.price, r.stock, JSON.stringify(r.eligible), r.image, r.active ? 1 : 0, r.archived ? 1 : 0, now, r.id, r.version ?? -1);
      if (!res.changes) throw new Error("A jutalmat közben módosították. Töltsd újra.");
      audit(u, "reward-save", r.id);
      return r.id;
    }
    const id = crypto.randomUUID();
    store()
      .prepare("INSERT INTO rewards VALUES(?,?,?,?,?,?,?,?,?,?,1,?,?)")
      .run(id, r.name, r.description, r.category, r.price, r.stock, JSON.stringify(r.eligible), r.image, r.active ? 1 : 0, r.archived ? 1 : 0, u.id, now);
    audit(u, "reward-create", id);
    return id;
  });
}
function event(u: User, id: string, action: string, reason = "") {
  store()
    .prepare("INSERT INTO reward_events(redemption_id,actor,action,reason,at) VALUES(?,?,?,?,?)")
    .run(id, u.id, action, reason, Date.now());
}
export function redeem(user: User, input: { rewardId: string; requestId: string; expectedPrice: number; person?: string | undefined }) {
  return tx(() => {
    const u = current(user),
      key = input.person ?? me(u);
    const dup = store().prepare("SELECT id,status FROM redemptions WHERE request_id=?").get(input.requestId) as
      | { id: string; status: RedemptionStatus } | undefined;
    if (dup) return dup; // double click / retry: same request is never charged twice
    const p = person(key);
    if (key !== me(u) && !(isParent(u) && p.child))
      throw new Error("Csak a saját pontjaidból vagy a gyermeked nevében kérhetsz jutalmat.");
    const row = rewardRow(input.rewardId);
    if (!row) throw new Error("Nincs ilyen jutalom.");
    const r = rewardOut(row);
    if (!r.active || r.archived) throw new Error("Ez a jutalom jelenleg nem elérhető.");
    if (!eligibleFor(r, key)) throw new Error("Ez a jutalom nem érhető el ennek a családtagnak.");
    if (r.price !== input.expectedPrice) throw new Error("A jutalom ára közben megváltozott. Nézd meg újra.");
    if (r.price > 0 && balanceOf(key).available < r.price) throw new Error("Nincs elég elérhető pont.");
    if (!store().prepare("UPDATE rewards SET stock=stock-1 WHERE id=? AND stock IS NOT NULL AND stock>0").run(r.id).changes && r.stock !== null)
      throw new Error("A jutalom elfogyott.");
    const id = crypto.randomUUID(),
      now = Date.now(),
      status: RedemptionStatus = p.child ? "reserved" : "awaiting";
    store()
      .prepare("INSERT INTO redemptions(id,request_id,reward_id,reward_name,person_key,price,status,requested_by,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,1,?,?)")
      .run(id, input.requestId, r.id, r.name, key, r.price, status, u.id, now, now);
    event(u, id, p.child ? "requested" : "redeemed");
    if (!p.child && r.price > 0)
      store()
        .prepare("INSERT INTO point_ledger(person_key,delta,kind,source,reason,actor,at) VALUES(?,?,?,?,?,?,?)")
        .run(key, -r.price, "redeem", `redeem:${id}`, `Beváltás: ${r.name}`, u.id, now);
    return { id, status };
  });
}
function redemption(id: string) {
  const r = store().prepare("SELECT * FROM redemptions WHERE id=?").get(id) as
    | { id: string; reward_id: string; reward_name: string; person_key: string; price: number; status: RedemptionStatus; requested_by: string; version: number }
    | undefined;
  if (!r) throw new Error("Nincs ilyen beváltás.");
  return r;
}
export function decideRedemption(
  user: User,
  input: { id: string; version: number; action: "approve" | "reject" | "cancel" | "handover"; reason?: string | undefined },
) {
  return tx(() => {
    const u = current(user),
      r = redemption(input.id),
      reason = (input.reason ?? "").trim().slice(0, 500);
    let next: RedemptionStatus;
    if (input.action === "cancel") {
      if (!(r.person_key === me(u) || r.requested_by === u.id || (isParent(u) && mayManage(u, r.person_key))))
        throw new Error("Ezt a kérést nem vonhatod vissza.");
      if (r.status !== "reserved") throw new Error("Csak jóváhagyásra váró kérés vonható vissza.");
      next = "cancelled";
    } else {
      if (!isParent(u) || !mayManage(u, r.person_key)) throw new Error("Erről csak jogosult szülő dönthet.");
      if (input.action === "handover") {
        if (r.status !== "awaiting") throw new Error("A jutalom nem vár átadásra.");
        next = "handed";
      } else {
        if (r.status !== "reserved") throw new Error("A kérésről már döntöttek.");
        if (input.action === "reject" && !reason) throw new Error("Az elutasításhoz indok szükséges.");
        next = input.action === "approve" ? "awaiting" : "rejected";
      }
    }
    if (!store().prepare("UPDATE redemptions SET status=?,decided_by=?,reason=?,version=version+1,updated_at=? WHERE id=? AND version=? AND status=?")
      .run(next, u.id, reason, Date.now(), r.id, input.version, r.status).changes)
      throw new Error("A kérés közben megváltozott. Töltsd újra.");
    if (next === "awaiting" && r.price > 0)
      store()
        .prepare("INSERT INTO point_ledger(person_key,delta,kind,source,reason,actor,at) VALUES(?,?,?,?,?,?,?)")
        .run(r.person_key, -r.price, "redeem", `redeem:${r.id}`, `Beváltás: ${r.reward_name}`, u.id, Date.now());
    if (next === "rejected" || next === "cancelled")
      store().prepare("UPDATE rewards SET stock=stock+1 WHERE id=? AND stock IS NOT NULL").run(r.reward_id);
    event(u, r.id, next, reason);
    return { status: next };
  });
}
export function setWish(user: User, input: { person: string; rewardId: string; wish: boolean; goal: boolean }) {
  return tx(() => {
    const u = current(user);
    person(input.person);
    if (!mayManage(u, input.person)) throw new Error("Csak a saját kívánságlistádat szerkesztheted.");
    if (!rewardRow(input.rewardId)) throw new Error("Nincs ilyen jutalom.");
    const d = store();
    if (input.goal) d.prepare("UPDATE reward_wishes SET goal=0 WHERE person_key=?").run(input.person);
    if (!input.wish) d.prepare("DELETE FROM reward_wishes WHERE person_key=? AND reward_id=?").run(input.person, input.rewardId);
    else
      d.prepare("INSERT INTO reward_wishes(person_key,reward_id,goal) VALUES(?,?,?) ON CONFLICT(person_key,reward_id) DO UPDATE SET goal=excluded.goal")
        .run(input.person, input.rewardId, input.goal ? 1 : 0);
  });
}

