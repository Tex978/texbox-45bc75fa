import { db, requirePermission, isHostedAccountPreview } from "./auth.server";
import { chatSendSchema, type ChatSend } from "./chat-schema";
import { DEFAULT_AVATAR, isAvatarIcon, isAvatarColor, type Avatar } from "./profile-schema";

function access(token: string | undefined) {
  if (isHostedAccountPreview()) throw new Error("A családi chat csak a saját NAS-on, bejelentkezés után érhető el.");
  const user = requirePermission(token);
  const d = db();
  if (!user || !d) throw new Error("A családi chathez jelentkezz be a saját NAS-címeden.");
  return { user, d };
}
// The existing permission model has no child chat grant; child login remains read-only.
export function chatStatus(token: string | undefined) {
  const {user,d} = access(token);
  const row = d.prepare(`SELECT COUNT(*) n FROM chat_messages WHERE sender_id<>? AND id>COALESCE((SELECT last_read_id FROM chat_receipts WHERE user_id=?),0)`).get(user.id,user.id) as { n: number };
  return { unread:Number(row.n), canSend:user.role!=="child", userId:user.id };
}
type MessageRow = { id:number; sender_id:string; text:string; created_at:number; name:string; icon:string; color:string };
export function chatList(token: string | undefined, before?: number) {
  const {user,d} = access(token);
  if (before !== undefined && (!Number.isSafeInteger(before)||before<=0)) throw new Error("Érvénytelen lapozás.");
  const rows = d.prepare(`SELECT m.id,m.sender_id,m.text,m.created_at,COALESCE(u.display_name,m.sender_name) name,COALESCE(p.icon,m.sender_icon) icon,COALESCE(p.color,m.sender_color) color FROM chat_messages m LEFT JOIN users u ON u.id=m.sender_id LEFT JOIN user_profiles p ON p.user_id=m.sender_id WHERE m.id<? ORDER BY m.id DESC LIMIT 101`).all(before ?? Number.MAX_SAFE_INTEGER) as MessageRow[];
  const slice=rows.slice(0,100);
  return { ...chatStatus(token), items:slice.reverse().map(r=>({id:Number(r.id),text:r.text,createdAt:r.created_at,senderId:r.sender_id,name:r.name,mine:r.sender_id===user.id,avatar:{icon:isAvatarIcon(r.icon)?r.icon:DEFAULT_AVATAR.icon,color:isAvatarColor(r.color)?r.color:DEFAULT_AVATAR.color} as Avatar})), olderCursor:rows.length>100?Number(slice[0]?.id):null };
}
export function chatSend(token: string | undefined, input:ChatSend) {
  const data=chatSendSchema.parse(input);
  const {user,d}=access(token);
  if(user.role==="child")throw new Error("Gyermekfiókkal a családi chat egyelőre csak olvasható.");
  d.exec("BEGIN IMMEDIATE");
  try {
    const old=d.prepare("SELECT id,text FROM chat_messages WHERE sender_id=? AND request_id=?").get(user.id,data.clientRequestId) as {id:number;text:string}|undefined;
    if(old){if(old.text!==data.text)throw new Error("Az üzenetazonosító már másik szöveghez tartozik.");d.exec("COMMIT");return {id:Number(old.id)};}
    const r=d.prepare("INSERT INTO chat_messages(sender_id,request_id,text,sender_name,sender_icon,sender_color,created_at) VALUES(?,?,?,?,?,?,?)").run(user.id,data.clientRequestId,data.text,user.displayName,user.avatar.icon,user.avatar.color,Date.now());
    d.exec("COMMIT");return {id:Number(r.lastInsertRowid)};
  }catch(e){d.exec("ROLLBACK");throw e;}
}
export function chatMarkRead(token:string|undefined,through:number) {
  const {user,d}=access(token);
  if(!Number.isSafeInteger(through)||through<=0||!d.prepare("SELECT 1 FROM chat_messages WHERE id=?").get(through))throw new Error("Az üzenet nem található.");
  d.prepare(`INSERT INTO chat_receipts(user_id,last_read_id,read_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET last_read_id=MAX(chat_receipts.last_read_id,excluded.last_read_id),read_at=excluded.read_at`).run(user.id,through,Date.now());
  return chatStatus(token);
}
